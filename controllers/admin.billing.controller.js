import db from '../db/knex.js';
import { HttpError, notFound } from '../utils/errors.js';
import { logAdminAction } from '../services/audit.js';
import {
  planDto, invoiceDto, loadSubscriptionView, setPlan, markInvoicePaid, voidInvoice, extendTrial, setCourtesy,
} from '../services/billing.js';
import { accessDto, todayBR, toDay } from '../services/storeAccess.js';

const pageParams = (req, d = 20) => ({
  page: Math.max(1, Number(req.query.page) || 1),
  limit: Math.min(100, Math.max(1, Number(req.query.limit) || d)),
});
const requireStore = async (id) => {
  if (!(await db('stores').where({ id }).first('id'))) throw notFound('Loja');
};

// ================= planos =================
const subscribersOf = (planId) => db('subscriptions').where({ plan_id: planId }).count({ n: 'id' }).first().then((r) => r.n);

// GET /api/admin/plans
export const listPlans = async (req, res) => {
  const rows = await db('plans as p')
    .select('p.*', db.raw('(SELECT COUNT(*) FROM subscriptions s WHERE s.plan_id = p.id) AS subscribers'))
    .orderBy([{ column: 'p.active', order: 'desc' }, { column: 'p.position' }, { column: 'p.id' }]);
  res.json(rows.map((p) => planDto(p, p.subscribers)));
};

// POST /api/admin/plans
export const createPlan = async (req, res) => {
  const { name, description, priceCents, position = 0, active = true } = req.body;
  const id = await db.transaction(async (trx) => {
    const [planId] = await trx('plans').insert({ name, description: description || null, price_cents: priceCents, position, active });
    await logAdminAction({ adminId: req.admin.id, action: 'PLAN_CREATED', details: { planId, name, priceCents } }, trx);
    return planId;
  });
  res.status(201).json(planDto(await db('plans').where({ id }).first(), 0));
};

// PATCH /api/admin/plans/:id — mudar preço vale para as PRÓXIMAS faturas; as já emitidas mantêm o valor
export const updatePlan = async (req, res) => {
  const id = Number(req.params.id);
  const map = { name: 'name', description: 'description', priceCents: 'price_cents', position: 'position', active: 'active' };
  const data = {};
  for (const [camel, snake] of Object.entries(map)) if (req.body[camel] !== undefined) data[snake] = req.body[camel];
  if ('description' in data) data.description = data.description || null;

  await db.transaction(async (trx) => {
    const plan = await trx('plans').where({ id }).forUpdate().first();
    if (!plan) throw notFound('Plano');
    if (!Object.keys(data).length) return;
    await trx('plans').where({ id }).update(data);
    await logAdminAction({
      adminId: req.admin.id, action: 'PLAN_UPDATED',
      details: { planId: id, changes: Object.fromEntries(Object.keys(req.body).filter((k) => k in map).map((k) => [k, req.body[k]])) },
    }, trx);
  });
  res.json(planDto(await db('plans').where({ id }).first(), await subscribersOf(id)));
};

// DELETE /api/admin/plans/:id — só se nunca foi usado; senão desative
export const deletePlan = async (req, res) => {
  const id = Number(req.params.id);
  await db.transaction(async (trx) => {
    const plan = await trx('plans').where({ id }).forUpdate().first();
    if (!plan) throw notFound('Plano');
    const used = (await trx('subscriptions').where({ plan_id: id }).first('id')) || (await trx('invoices').where({ plan_id: id }).first('id'));
    if (used) throw new HttpError(409, 'Este plano já foi usado por alguma loja. Desative-o em vez de excluir.', { code: 'PLAN_IN_USE' });
    await trx('plans').where({ id }).del();
    await logAdminAction({ adminId: req.admin.id, action: 'PLAN_DELETED', details: { planId: id, name: plan.name } }, trx);
  });
  res.status(204).end();
};

// ================= assinatura de uma loja =================
const respond = async (res, storeId, status = 200) => {
  const view = await loadSubscriptionView(storeId, { withEvents: true });
  res.status(status).json({ ...view, access: accessDto(view.access) });
};

// GET /api/admin/stores/:id/subscription
export const getSubscription = async (req, res) => {
  const id = Number(req.params.id);
  await requireStore(id);
  await respond(res, id);
};

// PUT /api/admin/stores/:id/subscription/plan  { planId }
export const putPlan = async (req, res) => {
  const id = Number(req.params.id);
  await requireStore(id);
  await db.transaction(async (trx) => {
    await setPlan(trx, id, req.body.planId, { actor: 'admin' });
    await logAdminAction({ adminId: req.admin.id, storeId: id, action: 'SUBSCRIPTION_PLAN_SET', details: { planId: req.body.planId } }, trx);
  });
  await respond(res, id);
};

// POST /api/admin/stores/:id/subscription/extend-trial  { days }
export const postExtendTrial = async (req, res) => {
  const id = Number(req.params.id);
  await requireStore(id);
  await db.transaction(async (trx) => {
    const trialEndsOn = await extendTrial(trx, id, req.body.days, { adminId: req.admin.id });
    await logAdminAction({ adminId: req.admin.id, storeId: id, action: 'TRIAL_EXTENDED', details: { days: req.body.days, trialEndsOn } }, trx);
  });
  await respond(res, id);
};

// PUT /api/admin/stores/:id/subscription/courtesy  { indefinite?: boolean, until?: 'AAAA-MM-DD' }  (nenhum dos dois = remove)
export const putCourtesy = async (req, res) => {
  const id = Number(req.params.id);
  await requireStore(id);
  const indefinite = req.body.indefinite === true;
  const until = indefinite ? null : (req.body.until ?? null);
  await db.transaction(async (trx) => {
    await setCourtesy(trx, id, { indefinite, until, adminId: req.admin.id });
    await logAdminAction({
      adminId: req.admin.id, storeId: id,
      action: indefinite || until ? 'COURTESY_GRANTED' : 'COURTESY_REVOKED',
      details: indefinite || until ? { indefinite, until } : null,
    }, trx);
  });
  await respond(res, id);
};

// POST /api/admin/stores/:id/invoices/:invoiceId/pay  { note? }
export const payInvoice = async (req, res) => {
  const storeId = Number(req.params.id);
  await requireStore(storeId);
  await db.transaction(async (trx) => {
    const { invoice, paidUntil } = await markInvoicePaid(trx, storeId, Number(req.params.invoiceId), { adminId: req.admin.id, note: req.body.note });
    await logAdminAction({
      adminId: req.admin.id, storeId, action: 'INVOICE_PAID',
      details: { invoiceId: invoice.id, amountCents: invoice.amount_cents, paidUntil, note: req.body.note || null },
    }, trx);
  });
  await respond(res, storeId);
};

// POST /api/admin/stores/:id/invoices/:invoiceId/void  { reason? }
export const cancelInvoice = async (req, res) => {
  const storeId = Number(req.params.id);
  await requireStore(storeId);
  await db.transaction(async (trx) => {
    await voidInvoice(trx, storeId, Number(req.params.invoiceId), { adminId: req.admin.id, reason: req.body.reason });
    await logAdminAction({ adminId: req.admin.id, storeId, action: 'INVOICE_VOIDED', details: { invoiceId: Number(req.params.invoiceId), reason: req.body.reason || null } }, trx);
  });
  await respond(res, storeId);
};

// GET /api/admin/invoices?status=open|overdue|reported|paid|void|all&page=&limit=
// Lista de trabalho do admin: "reported" = a loja disse que pagou e falta conferir o Pix.
export const listInvoices = async (req, res) => {
  const { status = 'open' } = req.query;
  const { page, limit } = pageParams(req);
  const today = todayBR();

  const filtered = db('invoices as i');
  if (status === 'open') filtered.where('i.status', 'OPEN');
  if (status === 'overdue') filtered.where('i.status', 'OPEN').where('i.due_on', '<', today);
  if (status === 'reported') filtered.where('i.status', 'OPEN').whereNotNull('i.reported_paid_at');
  if (status === 'paid') filtered.where('i.status', 'PAID');
  if (status === 'void') filtered.where('i.status', 'VOID');

  const { total } = await filtered.clone().count({ total: 'i.id' }).first();
  const rows = await filtered.clone()
    .join('stores as s', 's.id', 'i.store_id')
    .join('plans as p', 'p.id', 'i.plan_id')
    .select('i.*', 's.name as store_name', 's.slug as store_slug', 'p.name as plan_name')
    .orderBy([{ column: 'i.due_on', order: status === 'paid' || status === 'void' || status === 'all' ? 'desc' : 'asc' }, { column: 'i.id', order: 'asc' }])
    .limit(limit).offset((page - 1) * limit);

  res.json({
    page, limit, total: Number(total),
    invoices: rows.map((r) => invoiceDto(r, {
      store: { id: r.store_id, name: r.store_name, slug: r.store_slug }, planName: r.plan_name,
      overdue: r.status === 'OPEN' && toDay(r.due_on) < today,
    })),
  });
};
