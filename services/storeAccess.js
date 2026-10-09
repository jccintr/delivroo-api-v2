// Ponto ÚNICO que decide o que uma loja pode fazer. Duas fontes, independentes entre si:
//   1) `stores.active`  -> bloqueio MANUAL do admin geral (fraude, pedido do dono...). Derruba tudo.
//   2) assinatura       -> situação de cobrança, CALCULADA das datas na hora da leitura (sem cron).
//
// Linha do tempo de uma loja que não paga (D = último dia coberto, inclusive):
//   até D            TRIALING / ACTIVE / COURTESY   tudo liberado
//   D+1 .. D+7       PAST_DUE (carência)            tudo liberado + avisos
//   D+8 .. D+37      SUSPENDED                      cardápio fora do ar; painel só em Assinatura/pedidos em andamento
//   depois           CANCELED                       igual a suspensa (a loja só volta pagando)

export const STORE_BLOCKED = 'STORE_BLOCKED';
export const SUBSCRIPTION_SUSPENDED = 'SUBSCRIPTION_SUSPENDED';
export const MENU_UNAVAILABLE = 'MENU_UNAVAILABLE';

export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 7;
export const CANCEL_AFTER_DAYS = 30; // dias de suspensão até a assinatura ser considerada cancelada
export const INVOICE_LEAD_DAYS = 7;  // a fatura do próximo ciclo é gerada com esta antecedência
export const DUE_SOON_DAYS = 5;      // a partir daqui o painel avisa que está perto de vencer

export const ACCESS = Object.freeze({
  FULL: 'FULL',           // tudo liberado
  SUSPENDED: 'SUSPENDED', // inadimplência: sem cardápio público nem pedidos novos; painel restrito
  BLOCKED: 'BLOCKED',     // bloqueio do admin: sem login, sem cardápio, sem pedidos
});

export const BILLING = Object.freeze({
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  COURTESY: 'COURTESY',
  PAST_DUE: 'PAST_DUE',
  SUSPENDED: 'SUSPENDED',
  CANCELED: 'CANCELED',
});

// ---- datas (dias no fuso de Brasília, UTC-3 fixo; o Brasil não tem horário de verão) ----
export const toDay = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};
export const todayBR = (now = new Date()) => new Date(now.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
export const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const diffDays = (a, b) => Math.round((new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`)) / 86400000); // a - b
// Soma meses sem "estourar" o fim do mês (31/01 + 1 mês = 28/02, não 03/03).
export const addMonths = (day, n) => {
  const [y, m, d] = day.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
};
const maxDay = (...days) => days.filter(Boolean).sort().at(-1) ?? null;

/**
 * Situação de cobrança de uma assinatura.
 * @param {object|null} sub linha de `subscriptions` (trial_ends_on, paid_until, courtesy_until, courtesy_indefinite)
 */
export function getBillingStatus(sub, now = new Date()) {
  if (!sub) return { status: BILLING.ACTIVE, coveredThrough: null, graceEndsOn: null, daysLeft: null, daysOverdue: 0, dueSoon: false, missing: true };

  const today = todayBR(now);
  const trialEnds = toDay(sub.trial_ends_on);
  const paidUntil = toDay(sub.paid_until);
  const courtesyUntil = toDay(sub.courtesy_until);

  if (sub.courtesy_indefinite) {
    return { status: BILLING.COURTESY, coveredThrough: null, graceEndsOn: null, daysLeft: null, daysOverdue: 0, dueSoon: false, indefinite: true };
  }

  const coveredThrough = maxDay(trialEnds, paidUntil, courtesyUntil);
  const base = { coveredThrough, graceEndsOn: addDays(coveredThrough, GRACE_DAYS) };

  if (today <= coveredThrough) {
    const daysLeft = diffDays(coveredThrough, today);
    let status = BILLING.TRIALING;
    if (courtesyUntil === coveredThrough && courtesyUntil >= (paidUntil ?? '') && courtesyUntil >= trialEnds) status = BILLING.COURTESY;
    else if (paidUntil && paidUntil >= trialEnds) status = BILLING.ACTIVE;
    return { ...base, status, daysLeft, daysOverdue: 0, dueSoon: daysLeft <= DUE_SOON_DAYS };
  }

  const daysOverdue = diffDays(today, coveredThrough);
  if (daysOverdue <= GRACE_DAYS) return { ...base, status: BILLING.PAST_DUE, daysLeft: 0, daysOverdue, dueSoon: true };
  if (daysOverdue <= GRACE_DAYS + CANCEL_AFTER_DAYS) return { ...base, status: BILLING.SUSPENDED, daysLeft: 0, daysOverdue, dueSoon: true };
  return { ...base, status: BILLING.CANCELED, daysLeft: 0, daysOverdue, dueSoon: true };
}

/**
 * O que a loja pode fazer agora.
 * @param {{ active: boolean|number }} store linha de `stores`
 * @param {object|null} subscription linha de `subscriptions` (null = sem registro de cobrança: não bloqueia)
 */
export function getStoreAccess(store, subscription = null, now = new Date()) {
  const billing = getBillingStatus(subscription, now);
  if (!store || !store.active) {
    return { state: ACCESS.BLOCKED, reason: 'ADMIN_BLOCK', billing, menuAvailable: false, panel: 'NONE' };
  }
  if (billing.status === BILLING.SUSPENDED || billing.status === BILLING.CANCELED) {
    return { state: ACCESS.SUSPENDED, reason: 'BILLING', billing, menuAvailable: false, panel: 'BILLING_ONLY' };
  }
  return { state: ACCESS.FULL, reason: null, billing, menuAvailable: true, panel: 'FULL' };
}

// Bloqueio manual do admin (não olha cobrança): usado em login/token/SSE, onde loja suspensa ainda entra.
export const isStoreBlocked = (store) => !store || !store.active;

// O que o painel recebe (login, /me, /subscription).
export const accessDto = (access) => ({
  state: access.state,
  panel: access.panel,
  menuAvailable: access.menuAvailable,
  billing: {
    status: access.billing.status,
    coveredThrough: access.billing.coveredThrough,
    graceEndsOn: access.billing.graceEndsOn,
    daysLeft: access.billing.daysLeft,
    daysOverdue: access.billing.daysOverdue,
    dueSoon: access.billing.dueSoon,
    indefinite: !!access.billing.indefinite,
  },
});
