import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import db from '../db/knex.js';
import {
  getBillingStatus, getStoreAccess, addMonths, addDays, todayBR, GRACE_DAYS, CANCEL_AFTER_DAYS,
} from '../services/storeAccess.js';
import { api, auth, createAdminUser, registerStore, seedPizzaria } from './factories/helpers.js';

const today = () => todayBR();
const NOW = new Date('2026-10-10T15:00:00Z'); // 12:00 em Brasília -> dia 2026-10-10

describe('datas de cobrança', () => {
  it('soma meses sem estourar o fim do mês', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('o dia vira à meia-noite de Brasília, não de UTC', () => {
    expect(todayBR(new Date('2026-10-10T02:59:00Z'))).toBe('2026-10-09');
    expect(todayBR(new Date('2026-10-10T03:00:00Z'))).toBe('2026-10-10');
  });
});

describe('getStoreAccess: linha do tempo de quem não paga', () => {
  const store = { active: 1 };
  const trial = (endsOn, extra = {}) => ({ trial_ends_on: endsOn, paid_until: null, courtesy_until: null, courtesy_indefinite: 0, ...extra });
  const at = (sub, now = NOW) => getStoreAccess(store, sub, now);

  it('teste: libera tudo até o último dia (inclusive)', () => {
    expect(at(trial('2026-10-10')).billing).toMatchObject({ status: 'TRIALING', daysLeft: 0, dueSoon: true });
    const far = at(trial('2026-10-24')).billing;
    expect(far).toMatchObject({ status: 'TRIALING', daysLeft: 14, dueSoon: false });
    expect(at(trial('2026-10-24'))).toMatchObject({ state: 'FULL', menuAvailable: true, panel: 'FULL' });
  });

  it('vencida: 7 dias de carência com tudo funcionando', () => {
    for (let late = 1; late <= GRACE_DAYS; late++) {
      const access = at(trial(addDays('2026-10-10', -late)));
      expect(access.billing).toMatchObject({ status: 'PAST_DUE', daysOverdue: late });
      expect(access).toMatchObject({ state: 'FULL', menuAvailable: true });
    }
  });

  it('depois da carência: suspensa (cardápio fora, painel só cobrança)', () => {
    const access = at(trial(addDays('2026-10-10', -(GRACE_DAYS + 1))));
    expect(access.billing.status).toBe('SUSPENDED');
    expect(access).toMatchObject({ state: 'SUSPENDED', menuAvailable: false, panel: 'BILLING_ONLY' });
  });

  it('depois de mais 30 dias: cancelada (continua sem acesso)', () => {
    const access = at(trial(addDays('2026-10-10', -(GRACE_DAYS + CANCEL_AFTER_DAYS + 1))));
    expect(access.billing.status).toBe('CANCELED');
    expect(access).toMatchObject({ state: 'SUSPENDED', menuAvailable: false });
  });

  it('pago: ACTIVE; vale o que acabar por último (teste ou pagamento)', () => {
    expect(at(trial('2026-10-01', { paid_until: '2026-11-05' })).billing).toMatchObject({ status: 'ACTIVE', coveredThrough: '2026-11-05' });
    expect(at(trial('2026-10-20', { paid_until: '2026-10-15' })).billing.status).toBe('TRIALING');
  });

  it('cortesia: sem prazo libera sempre; com prazo vale até a data e depois segue a regra normal', () => {
    expect(at(trial('2020-01-01', { courtesy_indefinite: 1 })).billing).toMatchObject({ status: 'COURTESY', indefinite: true });
    expect(at(trial('2020-01-01', { courtesy_until: '2026-12-31' })).billing.status).toBe('COURTESY');
    // cortesia acabou ontem: carência normal a partir do fim dela
    expect(at(trial('2020-01-01', { courtesy_until: '2026-10-09' })).billing).toMatchObject({ status: 'PAST_DUE', daysOverdue: 1 });
  });

  it('bloqueio manual do admin vale sobre tudo, mesmo com a assinatura em dia', () => {
    const blocked = getStoreAccess({ active: 0 }, trial('2027-01-01'), NOW);
    expect(blocked).toMatchObject({ state: 'BLOCKED', reason: 'ADMIN_BLOCK', menuAvailable: false, panel: 'NONE' });
  });

  it('sem registro de cobrança não bloqueia ninguém', () => {
    expect(getStoreAccess(store, null, NOW)).toMatchObject({ state: 'FULL', menuAvailable: true });
  });
});

// ---------------- API ----------------

let admin; // { token }
let A; // loja com cardápio
const adminGet = (url) => api().get(url).set(auth(admin.token));
const adminPut = (url, body) => api().put(url).set(auth(admin.token)).send(body);
const adminPost = (url, body = {}) => api().post(url).set(auth(admin.token)).send(body);
const storeGet = (url) => api().get(url).set(auth(A.token));
const sub = (storeId = A.store.id) => db('subscriptions').where({ store_id: storeId }).first();
const setSub = (data, storeId = A.store.id) => db('subscriptions').where({ store_id: storeId }).update(data);
const makePlan = async (data = {}) => (await adminPost('/api/admin/plans', { name: 'Delivroo', priceCents: 9900, ...data }).expect(201)).body;

beforeEach(async () => {
  admin = await createAdminUser();
  const reg = await registerStore();
  A = { ...reg, s: await seedPizzaria(reg.token) };
});

describe('cadastro da loja', () => {
  it('nasce em teste de 14 dias, sem escolher plano', async () => {
    const me = await storeGet('/api/stores/me').expect(200);
    expect(me.body.access).toMatchObject({ state: 'FULL', panel: 'FULL', menuAvailable: true });
    expect(me.body.access.billing).toMatchObject({ status: 'TRIALING', daysLeft: 14, coveredThrough: addDays(today(), 14) });
    expect((await sub()).plan_id).toBeNull();
    const events = await db('billing_events').where({ store_id: A.store.id });
    expect(events.map((e) => e.type)).toEqual(['SUBSCRIPTION_CREATED']);
  });

  it('login e cadastro também devolvem `access`', async () => {
    const reg = await registerStore();
    expect(reg.store).toBeDefined();
    const row = await db('stores').where({ id: reg.store.id }).first();
    const login = await api().post('/api/stores/login').send({ email: row.email, password: '123456' }).expect(200);
    expect(login.body.access.billing.status).toBe('TRIALING');
  });

  it('loja antiga sem assinatura ganha um teste na primeira consulta (ninguém fica trancado)', async () => {
    await db('subscriptions').where({ store_id: A.store.id }).del();
    expect((await storeGet('/api/stores/me').expect(200)).body.access.state).toBe('FULL');
    const res = await storeGet('/api/stores/subscription').expect(200);
    expect(res.body.access.billing.status).toBe('TRIALING');
    expect(await sub()).toBeTruthy();
  });
});

describe('planos (admin)', () => {
  it('exige login de admin', async () => {
    expect((await api().get('/api/admin/plans')).status).toBe(401);
    expect((await api().get('/api/admin/plans').set(auth(A.token))).status).toBe(401); // token de loja não vale
    expect((await api().get(`/api/admin/stores/${A.store.id}/subscription`)).status).toBe(401);
    expect((await api().get('/api/admin/invoices')).status).toBe(401);
  });

  it('cria, lista, edita, desativa e exclui plano nunca usado', async () => {
    const plan = await makePlan({ description: 'Tudo incluso' });
    expect(plan).toMatchObject({ name: 'Delivroo', priceCents: 9900, active: true, description: 'Tudo incluso', subscribersCount: 0 });

    const edited = await api().patch(`/api/admin/plans/${plan.id}`).set(auth(admin.token)).send({ priceCents: 12900, active: false }).expect(200);
    expect(edited.body).toMatchObject({ priceCents: 12900, active: false });

    const list = await adminGet('/api/admin/plans').expect(200);
    expect(list.body.map((p) => p.id)).toEqual([plan.id]);

    await api().delete(`/api/admin/plans/${plan.id}`).set(auth(admin.token)).expect(204);
    expect((await adminGet('/api/admin/plans')).body).toEqual([]);

    const actions = (await db('admin_audit_log').orderBy('id')).map((e) => e.action);
    expect(actions).toEqual(['PLAN_CREATED', 'PLAN_UPDATED', 'PLAN_DELETED']);
  });

  it('lista ativos primeiro, por posição', async () => {
    const b = await makePlan({ name: 'B', position: 2 });
    const a = await makePlan({ name: 'A', position: 1 });
    const off = await makePlan({ name: 'Off', position: 0, active: false });
    expect((await adminGet('/api/admin/plans')).body.map((p) => p.id)).toEqual([a.id, b.id, off.id]);
  });

  it('valida nome, preço em centavos inteiros e booleanos de verdade', async () => {
    const post = (b) => adminPost('/api/admin/plans', b);
    expect((await post({ priceCents: 100 })).status).toBe(400);
    expect((await post({ name: 'X', priceCents: 99.5 })).status).toBe(400);
    expect((await post({ name: 'X', priceCents: -1 })).status).toBe(400);
    expect((await post({ name: 'X', priceCents: 100, active: 'sim' })).status).toBe(400);
    expect((await post({ name: 'X', priceCents: 0 })).status).toBe(201); // plano grátis é permitido
    expect((await api().patch('/api/admin/plans/99999').set(auth(admin.token)).send({ name: 'Y' })).status).toBe(404);
    expect((await api().delete('/api/admin/plans/99999').set(auth(admin.token))).status).toBe(404);
  });

  it('plano já usado não pode ser excluído (409), só desativado', async () => {
    const plan = await makePlan();
    await api().put('/api/stores/subscription/plan').set(auth(A.token)).send({ planId: plan.id }).expect(200);
    const del = await api().delete(`/api/admin/plans/${plan.id}`).set(auth(admin.token));
    expect(del.status).toBe(409);
    expect(del.body.code).toBe('PLAN_IN_USE');
    const list = await adminGet('/api/admin/plans');
    expect(list.body[0].subscribersCount).toBe(1);
  });
});

// O .env de quem roda os testes pode ter a chave Pix real: os testes controlam essas variáveis por conta própria.
const PIX_VARS = ['BILLING_PIX_KEY', 'BILLING_PIX_KEY_TYPE', 'BILLING_PIX_BENEFICIARY', 'BILLING_PIX_INSTRUCTIONS'];
const savedPix = {};
beforeEach(() => { for (const k of PIX_VARS) { savedPix[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of PIX_VARS) { if (savedPix[k] === undefined) delete process.env[k]; else process.env[k] = savedPix[k]; } });

describe('loja escolhe o plano e recebe a fatura', () => {
  it('sem planos cadastrados: a tela vem vazia, sem erro', async () => {
    const res = await storeGet('/api/stores/subscription').expect(200);
    expect(res.body.plans).toEqual([]);
    expect(res.body.invoices).toEqual([]);
    expect(res.body.subscription.plan).toBeNull();
    expect(res.body.pix).toBeNull();
  });

  it('só oferece planos ativos', async () => {
    const on = await makePlan({ name: 'Ativo' });
    await makePlan({ name: 'Inativo', active: false });
    const res = await storeGet('/api/stores/subscription');
    expect(res.body.plans.map((p) => p.id)).toEqual([on.id]);
  });

  it('escolher o plano gera a fatura na hora, vencendo no fim do teste, com o preço do plano', async () => {
    const plan = await makePlan({ priceCents: 8900 });
    const res = await api().put('/api/stores/subscription/plan').set(auth(A.token)).send({ planId: plan.id }).expect(200);
    const trialEnds = addDays(today(), 14);

    expect(res.body.subscription.plan).toMatchObject({ id: plan.id, priceCents: 8900 });
    expect(res.body.invoices).toHaveLength(1);
    expect(res.body.invoices[0]).toMatchObject({
      status: 'OPEN', amountCents: 8900, dueOn: trialEnds, periodStart: addDays(trialEnds, 1), periodEnd: addDays(addMonths(addDays(trialEnds, 1), 1), -1), overdue: false,
    });
    // continua em teste: pagar adianta, não encurta
    expect(res.body.access.billing.status).toBe('TRIALING');
  });

  it('mudar o preço do plano não altera fatura já emitida, só as próximas', async () => {
    const plan = await makePlan({ priceCents: 5000 });
    await api().put('/api/stores/subscription/plan').set(auth(A.token)).send({ planId: plan.id }).expect(200);
    await api().patch(`/api/admin/plans/${plan.id}`).set(auth(admin.token)).send({ priceCents: 7000 }).expect(200);
    const res = await storeGet('/api/stores/subscription');
    expect(res.body.invoices[0].amountCents).toBe(5000);
    expect(res.body.subscription.plan.priceCents).toBe(7000);
  });

  it('trocar de plano cancela a fatura aberta e emite outra (nunca duas abertas)', async () => {
    const basic = await makePlan({ name: 'Básico', priceCents: 5000 });
    const pro = await makePlan({ name: 'Pro', priceCents: 9000 });
    await api().put('/api/stores/subscription/plan').set(auth(A.token)).send({ planId: basic.id }).expect(200);
    const res = await api().put('/api/stores/subscription/plan').set(auth(A.token)).send({ planId: pro.id }).expect(200);

    const byStatus = (s) => res.body.invoices.filter((i) => i.status === s);
    expect(byStatus('OPEN')).toHaveLength(1);
    expect(byStatus('OPEN')[0].amountCents).toBe(9000);
    expect(byStatus('VOID')).toHaveLength(1);
    // escolher o mesmo plano de novo não duplica
    const again = await api().put('/api/stores/subscription/plan').set(auth(A.token)).send({ planId: pro.id }).expect(200);
    expect(again.body.invoices).toHaveLength(2);
  });

  it('plano desativado ou inexistente é recusado; quem já está nele continua', async () => {
    const plan = await makePlan();
    await api().put('/api/stores/subscription/plan').set(auth(A.token)).send({ planId: plan.id }).expect(200);
    await api().patch(`/api/admin/plans/${plan.id}`).set(auth(admin.token)).send({ active: false }).expect(200);

    // quem já tem o plano pode "escolher" de novo
    await api().put('/api/stores/subscription/plan').set(auth(A.token)).send({ planId: plan.id }).expect(200);
    // outra loja não consegue
    const other = await registerStore();
    expect((await api().put('/api/stores/subscription/plan').set(auth(other.token)).send({ planId: plan.id })).status).toBe(422);
    expect((await api().put('/api/stores/subscription/plan').set(auth(other.token)).send({ planId: 99999 })).status).toBe(422);
    expect((await api().put('/api/stores/subscription/plan').set(auth(other.token)).send({ planId: 'x' })).status).toBe(400);
  });

  it('expõe a chave Pix do Delivroo quando configurada no servidor', async () => {
    process.env.BILLING_PIX_KEY = 'pix@delivroo.app.br';
    process.env.BILLING_PIX_BENEFICIARY = 'Delivroo Ltda';
    const res = await storeGet('/api/stores/subscription').expect(200);
    expect(res.body.pix).toMatchObject({ key: 'pix@delivroo.app.br', beneficiary: 'Delivroo Ltda' });
  });

  it('exige login da loja', async () => {
    expect((await api().get('/api/stores/subscription')).status).toBe(401);
    expect((await api().put('/api/stores/subscription/plan').send({ planId: 1 })).status).toBe(401);
  });
});

describe('pagamento manual por Pix', () => {
  let plan;
  let invoice;
  beforeEach(async () => {
    plan = await makePlan({ priceCents: 9900 });
    const res = await api().put('/api/stores/subscription/plan').set(auth(A.token)).send({ planId: plan.id }).expect(200);
    invoice = res.body.invoices[0];
  });

  it('"Já paguei" só sinaliza: não libera nada e é idempotente', async () => {
    const url = `/api/stores/subscription/invoices/${invoice.id}/report-payment`;
    const first = await api().post(url).set(auth(A.token)).send({ note: 'Pix das 14h' }).expect(200);
    expect(first.body.invoices[0]).toMatchObject({ status: 'OPEN', reportedNote: 'Pix das 14h' });
    expect(first.body.invoices[0].reportedPaidAt).not.toBeNull();
    const t1 = first.body.invoices[0].reportedPaidAt;
    const second = await api().post(url).set(auth(A.token)).send({ note: 'outra' }).expect(200);
    expect(second.body.invoices[0].reportedPaidAt).toBe(t1);
    expect(second.body.invoices[0].reportedNote).toBe('Pix das 14h');
    expect((await sub()).paid_until).toBeNull();
    expect(await db('billing_events').where({ type: 'PAYMENT_REPORTED' })).toHaveLength(1);
  });

  it('a loja não enxerga fatura de outra loja', async () => {
    const other = await registerStore();
    const res = await api().post(`/api/stores/subscription/invoices/${invoice.id}/report-payment`).set(auth(other.token)).send({});
    expect(res.status).toBe(404);
  });

  it('o admin marca como paga: o período novo começa no vencimento e a fatura seguinte aparece perto do fim', async () => {
    const trialEnds = addDays(today(), 14);
    const res = await adminPost(`/api/admin/stores/${A.store.id}/invoices/${invoice.id}/pay`, { note: 'Pix conferido' }).expect(200);
    const paid = res.body.invoices.find((i) => i.id === invoice.id);
    expect(paid).toMatchObject({ status: 'PAID', paymentNote: 'Pix conferido', periodStart: addDays(trialEnds, 1) });
    expect(res.body.subscription.paidUntil).toBe(paid.periodEnd);
    expect(res.body.access.billing).toMatchObject({ status: 'ACTIVE', coveredThrough: paid.periodEnd }); // pagou adiantado: o teste não é encurtado, o pago vem depois
  });

  it('pagar não repete (409) e registra a auditoria e o histórico', async () => {
    const url = `/api/admin/stores/${A.store.id}/invoices/${invoice.id}/pay`;
    await adminPost(url).expect(200);
    expect((await adminPost(url)).status).toBe(409);
    const audit = await db('admin_audit_log').where({ action: 'INVOICE_PAID' });
    expect(audit).toHaveLength(1);
    expect(await db('billing_events').where({ type: 'INVOICE_PAID', actor: 'admin' })).toHaveLength(1);
  });

  it('não paga fatura de outra loja nem fatura cancelada', async () => {
    const other = await registerStore();
    expect((await adminPost(`/api/admin/stores/${other.store.id}/invoices/${invoice.id}/pay`)).status).toBe(404);
    await adminPost(`/api/admin/stores/${A.store.id}/invoices/${invoice.id}/void`, { reason: 'engano' }).expect(200);
    expect((await adminPost(`/api/admin/stores/${A.store.id}/invoices/${invoice.id}/pay`)).status).toBe(409);
    expect((await adminPost(`/api/admin/stores/${A.store.id}/invoices/${invoice.id}/void`)).status).toBe(409);
  });

  it('a fatura do próximo ciclo só aparece quando faltam 7 dias ou menos', async () => {
    await adminPost(`/api/admin/stores/${A.store.id}/invoices/${invoice.id}/pay`).expect(200);
    const afterPay = await storeGet('/api/stores/subscription');
    expect(afterPay.body.invoices).toHaveLength(1); // coberta por ~1 mês e meio: nada a emitir

    await setSub({ trial_ends_on: addDays(today(), -60), paid_until: addDays(today(), 6) });
    const near = await storeGet('/api/stores/subscription');
    expect(near.body.invoices).toHaveLength(2);
    const next = near.body.invoices[0];
    expect(next).toMatchObject({ status: 'OPEN', dueOn: addDays(today(), 6), periodStart: addDays(today(), 7), amountCents: 9900 });
    // consultar de novo não cria outra
    expect((await storeGet('/api/stores/subscription')).body.invoices).toHaveLength(2);
  });

  it('invoice nunca é gerada sem plano nem para cortesia sem prazo', async () => {
    const other = await registerStore();
    await db('subscriptions').where({ store_id: other.store.id }).update({ trial_ends_on: addDays(today(), 1) });
    expect((await api().get('/api/stores/subscription').set(auth(other.token))).body.invoices).toEqual([]);

    await adminPut(`/api/admin/stores/${A.store.id}/subscription/courtesy`, { indefinite: true }).expect(200);
    const view = await storeGet('/api/stores/subscription');
    expect(view.body.invoices.filter((i) => i.status === 'OPEN')).toEqual([]); // a aberta foi cancelada
  });
});

describe('inadimplência: carência, suspensão e volta', () => {
  let plan;
  beforeEach(async () => {
    plan = await makePlan();
    await api().put('/api/stores/subscription/plan').set(auth(A.token)).send({ planId: plan.id }).expect(200);
  });
  const expireTrial = (daysAgo) => setSub({ trial_ends_on: addDays(today(), -daysAgo) });
  const orderBody = () => ({
    fulfillment: 'PICKUP', name: 'Maria', phone: '(35) 99999-1111', paymentMethodId: A.s.pix.id,
    items: [{ productId: A.s.soda.id, variantId: A.s.soda.variants[0].id, quantity: 1, options: [] }],
  });
  const placeOrder = () => api().post(`/api/public/stores/${A.store.slug}/orders`).send(orderBody());
  const menu = () => api().get(`/api/public/stores/${A.store.slug}/menu`);

  it('vencida mas dentro da carência: tudo continua funcionando e o painel recebe o aviso', async () => {
    await expireTrial(GRACE_DAYS);
    const me = await storeGet('/api/stores/me').expect(200);
    expect(me.body.access.billing).toMatchObject({ status: 'PAST_DUE', daysOverdue: GRACE_DAYS, dueSoon: true });
    expect((await menu()).status).toBe(200);
    expect((await placeOrder()).status).toBe(201);
    expect((await storeGet('/api/stores/products')).status).toBe(200);
    const inv = (await storeGet('/api/stores/subscription')).body.invoices[0];
    expect(inv).toMatchObject({ status: 'OPEN', overdue: true });
  });

  describe('suspensa', () => {
    beforeEach(async () => {
      await expireTrial(GRACE_DAYS + 1);
    });

    it('cardápio público e pedidos novos respondem 403 MENU_UNAVAILABLE (mesma resposta do bloqueio manual)', async () => {
      const m = await menu();
      expect(m.status).toBe(403);
      expect(m.body).toMatchObject({ code: 'MENU_UNAVAILABLE', error: 'Cardápio indisponível.' });
      const o = await placeOrder();
      expect(o.status).toBe(403);
      expect(o.body.code).toBe('MENU_UNAVAILABLE');
      // slug que não existe continua sendo 404
      expect((await api().get('/api/public/stores/nao-existe/menu')).status).toBe(404);
    });

    it('a loja ainda faz login e vê que está suspensa', async () => {
      const row = await db('stores').where({ id: A.store.id }).first();
      const login = await api().post('/api/stores/login').send({ email: row.email, password: '123456' });
      expect(login.status).toBe(200);
      expect(login.body.access).toMatchObject({ state: 'SUSPENDED', panel: 'BILLING_ONLY', menuAvailable: false });
    });

    it('o painel fica restrito: o resto responde 402, mas Assinatura, pedidos e exportação funcionam', async () => {
      const blocked = await storeGet('/api/stores/products');
      expect(blocked.status).toBe(402);
      expect(blocked.body.code).toBe('SUBSCRIPTION_SUSPENDED');
      expect((await api().post('/api/stores/products').set(auth(A.token)).send({})).status).toBe(402);
      expect((await api().patch('/api/stores/me').set(auth(A.token)).send({ name: 'Novo Nome' })).status).toBe(402);
      expect((await api().patch('/api/stores/me/status').set(auth(A.token)).send({ isOpen: true })).status).toBe(402);

      expect((await storeGet('/api/stores/me')).status).toBe(200);
      expect((await storeGet('/api/stores/subscription')).status).toBe(200);
      expect((await storeGet('/api/stores/orders')).status).toBe(200);
      expect((await api().post('/api/stores/events-token').set(auth(A.token))).status).toBe(200);
      const exp = await storeGet('/api/stores/me/export').expect(200);
      expect(exp.body.store.id).toBe(A.store.id);
      expect(exp.body.products.length).toBeGreaterThan(0);
    });

    it('pedido que já estava em andamento pode ser concluído', async () => {
      await setSub({ trial_ends_on: addDays(today(), 5) });
      const order = (await placeOrder()).body;
      await expireTrial(GRACE_DAYS + 1);
      const res = await api().post(`/api/stores/orders/${order.id}/status`).set(auth(A.token)).send({ status: 'PREPARING' });
      expect(res.status).toBe(200);
      // o cliente continua acompanhando o pedido dele
      expect((await api().get(`/api/public/orders/${order.publicId}`)).status).toBe(200);
    });

    it('pagar tira da suspensão na hora, e o mês pago conta a partir de HOJE', async () => {
      const inv = (await storeGet('/api/stores/subscription')).body.invoices[0];
      const res = await adminPost(`/api/admin/stores/${A.store.id}/invoices/${inv.id}/pay`).expect(200);
      expect(res.body.access).toMatchObject({ state: 'FULL', menuAvailable: true });
      expect(res.body.access.billing.status).toBe('ACTIVE');
      const paid = res.body.invoices.find((i) => i.id === inv.id);
      expect(paid.periodStart).toBe(today());
      expect(paid.periodEnd).toBe(addDays(addMonths(today(), 1), -1));
      expect((await menu()).status).toBe(200);
      expect((await storeGet('/api/stores/products')).status).toBe(200);
    });

    it('estender o teste também reabre a loja', async () => {
      const res = await adminPost(`/api/admin/stores/${A.store.id}/subscription/extend-trial`, { days: 5 }).expect(200);
      expect(res.body.subscription.trialEndsOn).toBe(addDays(today(), 5));
      expect(res.body.access.billing).toMatchObject({ status: 'TRIALING', daysLeft: 5 });
      expect((await menu()).status).toBe(200);
    });

    it('depois de muito tempo vira CANCELED, que também segue sem acesso', async () => {
      await expireTrial(GRACE_DAYS + CANCEL_AFTER_DAYS + 5);
      const view = await storeGet('/api/stores/subscription');
      expect(view.body.access.billing.status).toBe('CANCELED');
      expect((await menu()).status).toBe(403);
    });
  });

  it('o bloqueio manual do admin continua independente da cobrança', async () => {
    await adminPut(`/api/admin/stores/${A.store.id}/subscription/courtesy`, { indefinite: true }).expect(200);
    await api().patch(`/api/admin/stores/${A.store.id}/active`).set(auth(admin.token)).send({ active: false, reason: 'fraude' }).expect(200);
    const me = await storeGet('/api/stores/me');
    expect(me.status).toBe(401);
    expect(me.body.code).toBe('STORE_BLOCKED');
    const row = await db('stores').where({ id: A.store.id }).first();
    const login = await api().post('/api/stores/login').send({ email: row.email, password: '123456' });
    expect(login.status).toBe(403);
    expect(login.body.code).toBe('STORE_BLOCKED');
    expect((await menu()).status).toBe(403);
    // ao reativar, a cortesia continua valendo
    await api().patch(`/api/admin/stores/${A.store.id}/active`).set(auth(admin.token)).send({ active: true }).expect(200);
    expect((await menu()).status).toBe(200);
  });
});

describe('cortesia e extensão de teste (admin)', () => {
  const url = () => `/api/admin/stores/${A.store.id}/subscription`;

  it('cortesia sem prazo: libera mesmo com o teste vencido há meses; remover volta à regra normal', async () => {
    await setSub({ trial_ends_on: addDays(today(), -90) });
    expect((await api().get(`/api/public/stores/${A.store.slug}/menu`)).status).toBe(403);

    const res = await adminPut(`${url()}/courtesy`, { indefinite: true }).expect(200);
    expect(res.body.access.billing).toMatchObject({ status: 'COURTESY', indefinite: true });
    expect((await api().get(`/api/public/stores/${A.store.slug}/menu`)).status).toBe(200);

    const removed = await adminPut(`${url()}/courtesy`, {}).expect(200);
    expect(removed.body.access.billing.status).toBe('CANCELED');
    expect(removed.body.subscription).toMatchObject({ courtesyIndefinite: false, courtesyUntil: null });
  });

  it('cortesia até uma data', async () => {
    const until = addDays(today(), 30);
    const res = await adminPut(`${url()}/courtesy`, { until }).expect(200);
    expect(res.body.subscription.courtesyUntil).toBe(until);
    expect(res.body.access.billing).toMatchObject({ status: 'COURTESY', coveredThrough: until });
  });

  it('valida a cortesia: formato, passado, e não aceita sem prazo + data juntos', async () => {
    expect((await adminPut(`${url()}/courtesy`, { until: '31/12/2026' })).status).toBe(400);
    expect((await adminPut(`${url()}/courtesy`, { until: '2026-02-30x' })).status).toBe(400);
    expect((await adminPut(`${url()}/courtesy`, { until: addDays(today(), -1) })).status).toBe(422);
    expect((await adminPut(`${url()}/courtesy`, { indefinite: true, until: addDays(today(), 5) })).status).toBe(400);
    expect((await adminPut(`${url()}/courtesy`, { indefinite: 'sim' })).status).toBe(400);
  });

  it('estender o teste soma a partir do fim atual (ou de hoje, se já venceu) e valida os dias', async () => {
    const a = await adminPost(`${url()}/extend-trial`, { days: 10 }).expect(200);
    expect(a.body.subscription.trialEndsOn).toBe(addDays(today(), 24));
    await setSub({ trial_ends_on: addDays(today(), -30) });
    const b = await adminPost(`${url()}/extend-trial`, { days: 10 }).expect(200);
    expect(b.body.subscription.trialEndsOn).toBe(addDays(today(), 10));
    expect((await adminPost(`${url()}/extend-trial`, { days: 0 })).status).toBe(400);
    expect((await adminPost(`${url()}/extend-trial`, { days: 366 })).status).toBe(400);
    expect((await adminPost(`${url()}/extend-trial`, { days: 1.5 })).status).toBe(400);
  });

  it('estender o teste leva junto o vencimento da fatura já emitida', async () => {
    const plan = await makePlan();
    const first = (await api().put('/api/stores/subscription/plan').set(auth(A.token)).send({ planId: plan.id })).body.invoices[0];
    expect(first.dueOn).toBe(addDays(today(), 14));
    await adminPost(`${url()}/extend-trial`, { days: 10 }).expect(200);
    const inv = (await storeGet('/api/stores/subscription')).body.invoices[0];
    expect(inv).toMatchObject({ id: first.id, dueOn: addDays(today(), 24), periodStart: addDays(today(), 25), overdue: false });
  });

  it('o admin pode definir o plano da loja; tudo vai para o histórico e a auditoria', async () => {
    const plan = await makePlan();
    const res = await adminPut(`${url()}/plan`, { planId: plan.id }).expect(200);
    expect(res.body.subscription.planId).toBe(plan.id);
    expect(res.body.invoices[0].status).toBe('OPEN');
    await adminPost(`${url()}/extend-trial`, { days: 3 }).expect(200);
    await adminPut(`${url()}/courtesy`, { indefinite: true }).expect(200);

    const events = (await adminGet(url())).body.events.map((e) => e.type);
    expect(events).toEqual(expect.arrayContaining(['SUBSCRIPTION_CREATED', 'PLAN_CHOSEN', 'INVOICE_CREATED', 'TRIAL_EXTENDED', 'COURTESY_GRANTED']));
    const actions = (await db('admin_audit_log').where({ store_id: A.store.id })).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['SUBSCRIPTION_PLAN_SET', 'TRIAL_EXTENDED', 'COURTESY_GRANTED']));
  });

  it('404 para loja inexistente e 400 para ID inválido', async () => {
    expect((await adminGet('/api/admin/stores/99999/subscription')).status).toBe(404);
    expect((await adminPost('/api/admin/stores/99999/subscription/extend-trial', { days: 3 })).status).toBe(404);
    expect((await adminGet('/api/admin/stores/abc/subscription')).status).toBe(400);
    expect((await adminPut('/api/admin/stores/99999/subscription/plan', { planId: 1 })).status).toBe(404);
  });
});

describe('listas do backoffice', () => {
  it('lojas trazem a situação de cobrança calculada', async () => {
    const suspended = await registerStore();
    await db('subscriptions').where({ store_id: suspended.store.id }).update({ trial_ends_on: addDays(today(), -20) });
    const res = await adminGet('/api/admin/stores').expect(200);
    const byId = Object.fromEntries(res.body.stores.map((s) => [s.id, s]));
    expect(byId[A.store.id].billing).toMatchObject({ status: 'TRIALING', planName: null });
    expect(byId[suspended.store.id].billing.status).toBe('SUSPENDED');
    const one = await adminGet(`/api/admin/stores/${suspended.store.id}`).expect(200);
    expect(one.body.billing.status).toBe('SUSPENDED');
  });

  it('faturas: filtros open / overdue / reported / paid e dados da loja', async () => {
    const plan = await makePlan();
    const b = await registerStore();
    const sA = (await api().put('/api/stores/subscription/plan').set(auth(A.token)).send({ planId: plan.id })).body;
    const sB = (await api().put('/api/stores/subscription/plan').set(auth(b.token)).send({ planId: plan.id })).body;
    await db('subscriptions').where({ store_id: b.store.id }).update({ trial_ends_on: addDays(today(), -2) });
    await db('invoices').where({ id: sB.invoices[0].id }).update({ due_on: addDays(today(), -2) });
    await api().post(`/api/stores/subscription/invoices/${sA.invoices[0].id}/report-payment`).set(auth(A.token)).send({}).expect(200);

    const ids = async (status) => (await adminGet(`/api/admin/invoices?status=${status}`)).body.invoices.map((i) => i.id);
    expect((await ids('open')).sort()).toEqual([sA.invoices[0].id, sB.invoices[0].id].sort());
    expect(await ids('overdue')).toEqual([sB.invoices[0].id]);
    expect(await ids('reported')).toEqual([sA.invoices[0].id]);
    expect(await ids('paid')).toEqual([]);

    await adminPost(`/api/admin/stores/${A.store.id}/invoices/${sA.invoices[0].id}/pay`).expect(200);
    expect(await ids('paid')).toEqual([sA.invoices[0].id]);
    expect(await ids('reported')).toEqual([]);

    const first = (await adminGet('/api/admin/invoices?status=paid')).body.invoices[0];
    expect(first).toMatchObject({ store: { id: A.store.id, name: A.store.name }, planName: 'Delivroo', amountCents: 9900 });
    expect((await adminGet('/api/admin/invoices?status=xyz')).status).toBe(400);
    expect((await adminGet('/api/admin/invoices?limit=1')).body.invoices).toHaveLength(1);
  });
});