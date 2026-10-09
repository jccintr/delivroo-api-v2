import db from '../db/knex.js';
import { HttpError, notFound } from '../utils/errors.js';
import {
  TRIAL_DAYS, INVOICE_LEAD_DAYS, getBillingStatus, getStoreAccess,
  todayBR, toDay, addDays, addMonths, diffDays,
} from './storeAccess.js';
import { parseDetails } from './audit.js';

// Cobrança manual (Pix): a loja paga a chave do Delivroo, avisa "Já paguei" e o admin confere e marca a fatura
// como paga. O resto do sistema só enxerga `invoices`/`subscriptions`; trocar por um gateway depois significa
// escrever outro "provedor" que chama markInvoicePaid() quando o webhook confirmar — o restante não muda.
export const MANUAL_PROVIDER = 'manual';

// Fim do período que começa em `start` (1 mês de serviço: 05/10 -> 04/11).
const periodEnd = (start) => addDays(addMonths(start, 1), -1);

export async function recordBillingEvent(x, { storeId, invoiceId = null, type, actor = 'system', details = null }) {
  await x('billing_events').insert({
    store_id: storeId, invoice_id: invoiceId, type, actor, details: details === null ? null : JSON.stringify(details),
  });
}

/** Cria a assinatura em teste (14 dias). Chamado no cadastro da loja, dentro da mesma transação. */
export async function createTrial(x, storeId, now = new Date()) {
  const trialEndsOn = addDays(todayBR(now), TRIAL_DAYS);
  await x('subscriptions').insert({ store_id: storeId, trial_ends_on: trialEndsOn });
  await recordBillingEvent(x, { storeId, type: 'SUBSCRIPTION_CREATED', details: { trialEndsOn } });
  return trialEndsOn;
}

/** Linha da assinatura; se a loja (antiga) ainda não tem, cria o teste agora. `lock` = FOR UPDATE (dentro de transação). */
export async function getSubscription(x, storeId, { lock = false, now = new Date() } = {}) {
  const q = () => x('subscriptions').where({ store_id: storeId });
  let sub = await (lock ? q().forUpdate() : q()).first();
  if (!sub) {
    if (!(await x('stores').where({ id: storeId }).first('id'))) throw notFound('Loja');
    try { await createTrial(x, storeId, now); } catch (err) { if (err?.code !== 'ER_DUP_ENTRY') throw err; }
    sub = await (lock ? q().forUpdate() : q()).first();
  }
  return sub;
}

// O vencimento da fatura aberta acompanha o fim do período coberto: se o admin estendeu o teste ou deu cortesia
// depois que a fatura foi emitida, as datas dela são corrigidas (senão a loja veria fatura "vencida" sem estar).
async function syncInvoiceDates(trx, sub, invoice) {
  if (sub.courtesy_indefinite) return invoice;
  const { coveredThrough } = getBillingStatus(sub);
  if (toDay(invoice.due_on) === coveredThrough) return invoice;
  const periodStart = addDays(coveredThrough, 1);
  await trx('invoices').where({ id: invoice.id }).update({ due_on: coveredThrough, period_start: periodStart, period_end: periodEnd(periodStart) });
  return trx('invoices').where({ id: invoice.id }).first();
}

/**
 * Garante que exista a fatura aberta do próximo ciclo. Só gera quando há plano e o ciclo está perto de acabar
 * (INVOICE_LEAD_DAYS), a não ser com `force` (loja acabou de escolher o plano e quer pagar já).
 * Precisa rodar dentro de transação com a assinatura travada.
 */
export async function ensureOpenInvoice(trx, sub, { force = false, now = new Date() } = {}) {
  const open = await trx('invoices').where({ subscription_id: sub.id, status: 'OPEN' }).first();
  if (open) return syncInvoiceDates(trx, sub, open);
  if (!sub.plan_id || sub.courtesy_indefinite) return null;

  const billing = getBillingStatus(sub, now);
  const today = todayBR(now);
  if (!force && diffDays(billing.coveredThrough, today) > INVOICE_LEAD_DAYS) return null;

  const plan = await trx('plans').where({ id: sub.plan_id }).first();
  const periodStart = addDays(billing.coveredThrough, 1);
  const [id] = await trx('invoices').insert({
    store_id: sub.store_id, subscription_id: sub.id, plan_id: plan.id, amount_cents: plan.price_cents,
    period_start: periodStart, period_end: periodEnd(periodStart), due_on: billing.coveredThrough,
    status: 'OPEN', open_slot: 1, provider: MANUAL_PROVIDER,
  });
  await recordBillingEvent(trx, {
    storeId: sub.store_id, invoiceId: id, type: 'INVOICE_CREATED',
    details: { amountCents: plan.price_cents, dueOn: billing.coveredThrough, planId: plan.id },
  });
  return trx('invoices').where({ id }).first();
}

/** Escolha/troca de plano (pela loja ou pelo admin). Fatura aberta de outro plano é cancelada e refeita. */
export async function setPlan(trx, storeId, planId, { actor, now = new Date() }) {
  const sub = await getSubscription(trx, storeId, { lock: true, now });
  const plan = await trx('plans').where({ id: planId }).first();
  if (!plan) throw new HttpError(422, 'Plano inválido.');
  // plano desativado só continua valendo para quem já está nele
  if (!plan.active && sub.plan_id !== plan.id) throw new HttpError(422, 'Este plano não está mais disponível.');

  if (sub.plan_id !== plan.id) {
    await trx('invoices').where({ subscription_id: sub.id, status: 'OPEN' })
      .update({ status: 'VOID', open_slot: null });
    await trx('subscriptions').where({ id: sub.id }).update({ plan_id: plan.id });
    sub.plan_id = plan.id;
    await recordBillingEvent(trx, { storeId, type: 'PLAN_CHOSEN', actor, details: { planId: plan.id, name: plan.name, priceCents: plan.price_cents } });
  }
  await ensureOpenInvoice(trx, sub, { force: true, now });
  return sub;
}

/** Loja avisa que pagou. Não libera nada: só sinaliza ao admin que há um Pix para conferir. */
export async function reportPayment(trx, storeId, invoiceId, note) {
  const invoice = await trx('invoices').where({ id: invoiceId, store_id: storeId }).forUpdate().first();
  if (!invoice) throw notFound('Fatura');
  if (invoice.status !== 'OPEN') throw new HttpError(409, 'Esta fatura não está em aberto.');
  if (invoice.reported_paid_at) return invoice; // repetir não muda nada
  await trx('invoices').where({ id: invoice.id }).update({ reported_paid_at: trx.fn.now(3), reported_note: note || null });
  await recordBillingEvent(trx, { storeId, invoiceId: invoice.id, type: 'PAYMENT_REPORTED', actor: 'store', details: { note: note || null } });
  return trx('invoices').where({ id: invoice.id }).first();
}

/**
 * Admin confirmou o Pix. O novo período conta a partir do vencimento (pagou em dia) ou de HOJE (pagou atrasado:
 * quem ficou suspenso não perde o mês que acabou de pagar).
 */
export async function markInvoicePaid(trx, storeId, invoiceId, { adminId, note, now = new Date() }) {
  const invoice = await trx('invoices').where({ id: invoiceId, store_id: storeId }).forUpdate().first();
  if (!invoice) throw notFound('Fatura');
  if (invoice.status !== 'OPEN') throw new HttpError(409, invoice.status === 'PAID' ? 'Esta fatura já está paga.' : 'Esta fatura foi cancelada.');
  const sub = await getSubscription(trx, storeId, { lock: true, now });

  const today = todayBR(now);
  const start = toDay(invoice.period_start) > today ? toDay(invoice.period_start) : today;
  const end = periodEnd(start);
  await trx('invoices').where({ id: invoice.id }).update({
    status: 'PAID', open_slot: null, period_start: start, period_end: end,
    paid_at: trx.fn.now(3), paid_by_admin_id: adminId, payment_note: note || null,
  });
  const paidUntil = [toDay(sub.paid_until), end].filter(Boolean).sort().at(-1);
  await trx('subscriptions').where({ id: sub.id }).update({ paid_until: paidUntil });
  await recordBillingEvent(trx, {
    storeId, invoiceId: invoice.id, type: 'INVOICE_PAID', actor: 'admin',
    details: { adminId, amountCents: invoice.amount_cents, paidUntil, note: note || null },
  });
  return { invoice: await trx('invoices').where({ id: invoice.id }).first(), paidUntil };
}

export async function voidInvoice(trx, storeId, invoiceId, { adminId, reason }) {
  const invoice = await trx('invoices').where({ id: invoiceId, store_id: storeId }).forUpdate().first();
  if (!invoice) throw notFound('Fatura');
  if (invoice.status !== 'OPEN') throw new HttpError(409, 'Só é possível cancelar fatura em aberto.');
  await trx('invoices').where({ id: invoice.id }).update({ status: 'VOID', open_slot: null });
  await recordBillingEvent(trx, { storeId, invoiceId: invoice.id, type: 'INVOICE_VOIDED', actor: 'admin', details: { adminId, reason: reason || null } });
}

/** Soma `days` ao teste, a partir do que for maior: fim do teste atual ou hoje (serve também para teste já vencido). */
export async function extendTrial(trx, storeId, days, { adminId, now = new Date() }) {
  const sub = await getSubscription(trx, storeId, { lock: true, now });
  const from = [toDay(sub.trial_ends_on), todayBR(now)].sort().at(-1);
  const trialEndsOn = addDays(from, days);
  await trx('subscriptions').where({ id: sub.id }).update({ trial_ends_on: trialEndsOn });
  await recordBillingEvent(trx, { storeId, type: 'TRIAL_EXTENDED', actor: 'admin', details: { adminId, days, trialEndsOn } });
  return trialEndsOn;
}

/** Cortesia: plano grátis até uma data (`until`) ou sem prazo (`indefinite`). Passar nenhum dos dois remove. */
export async function setCourtesy(trx, storeId, { indefinite = false, until = null, adminId, now = new Date() }) {
  const sub = await getSubscription(trx, storeId, { lock: true, now });
  if (until && until < todayBR(now)) throw new HttpError(422, 'A data da cortesia não pode estar no passado.');
  const granting = indefinite || !!until;
  await trx('subscriptions').where({ id: sub.id }).update({
    courtesy_indefinite: indefinite, courtesy_until: indefinite ? null : until,
  });
  if (indefinite) await trx('invoices').where({ subscription_id: sub.id, status: 'OPEN' }).update({ status: 'VOID', open_slot: null });
  await recordBillingEvent(trx, {
    storeId, type: granting ? 'COURTESY_GRANTED' : 'COURTESY_REVOKED', actor: 'admin',
    details: { adminId, indefinite, until: indefinite ? null : until },
  });
}

// ---- DTOs ----
export const planDto = (p, subscribers) => ({
  id: p.id, name: p.name, description: p.description, priceCents: p.price_cents,
  position: p.position, active: !!p.active, createdAt: p.created_at, updatedAt: p.updated_at,
  ...(subscribers === undefined ? {} : { subscribersCount: Number(subscribers) }),
});

export const invoiceDto = (i, extra = {}) => ({
  id: i.id, storeId: i.store_id, planId: i.plan_id, amountCents: i.amount_cents,
  periodStart: toDay(i.period_start), periodEnd: toDay(i.period_end), dueOn: toDay(i.due_on),
  status: i.status, provider: i.provider,
  reportedPaidAt: i.reported_paid_at ?? null, reportedNote: i.reported_note ?? null,
  paidAt: i.paid_at ?? null, paymentNote: i.payment_note ?? null,
  createdAt: i.created_at,
  ...extra,
});

export const billingEventDto = (e) => ({ id: e.id, type: e.type, actor: e.actor, invoiceId: e.invoice_id, details: parseDetails(e.details), createdAt: e.created_at });

/**
 * Visão completa da cobrança de uma loja (usada pelo painel da loja e pelo backoffice).
 * Gera a fatura do próximo ciclo se chegou a hora (lazy, sem cron).
 */
export async function loadSubscriptionView(storeId, { now = new Date(), withEvents = false } = {}) {
  const store = await db('stores').where({ id: storeId }).first('id', 'active');
  if (!store) throw notFound('Loja');

  await db.transaction(async (trx) => {
    const sub = await getSubscription(trx, storeId, { lock: true, now });
    await ensureOpenInvoice(trx, sub, { now });
  });

  const sub = await getSubscription(db, storeId, { now });
  const access = getStoreAccess(store, sub, now);
  const [plan, invoices, events] = await Promise.all([
    sub.plan_id ? db('plans').where({ id: sub.plan_id }).first() : null,
    db('invoices').where({ store_id: storeId }).orderBy([{ column: 'id', order: 'desc' }]).limit(24),
    withEvents ? db('billing_events').where({ store_id: storeId }).orderBy([{ column: 'created_at', order: 'desc' }, { column: 'id', order: 'desc' }]).limit(50) : [],
  ]);

  const today = todayBR(now);
  const view = {
    access,
    subscription: {
      planId: sub.plan_id,
      plan: plan ? planDto(plan) : null,
      trialEndsOn: toDay(sub.trial_ends_on),
      paidUntil: toDay(sub.paid_until),
      courtesyUntil: toDay(sub.courtesy_until),
      courtesyIndefinite: !!sub.courtesy_indefinite,
    },
    invoices: invoices.map((i) => invoiceDto(i, { overdue: i.status === 'OPEN' && toDay(i.due_on) < today })),
  };
  if (withEvents) view.events = events.map(billingEventDto);
  return view;
}
