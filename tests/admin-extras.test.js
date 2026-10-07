import { describe, it, expect, beforeEach } from 'vitest';
import db from '../db/knex.js';
import { api, auth, registerStore, seedPizzaria } from './factories/helpers.js';

let A;
beforeEach(async () => {
  const reg = await registerStore();
  A = { ...reg, s: await seedPizzaria(reg.token) };
});

describe('Mensagens de WhatsApp', () => {
  it('exige login', async () => {
    expect((await api().get('/api/stores/message-templates')).status).toBe(401);
  });

  it('lista os 8 status com o texto padrão e permite personalizar e restaurar', async () => {
    const list = await api().get('/api/stores/message-templates').set(auth(A.token)).expect(200);
    expect(list.body).toHaveLength(8);
    expect(list.body.every((m) => m.isCustom === false && m.body === m.defaultBody)).toBe(true);

    const saved = await api().put('/api/stores/message-templates/READY').set(auth(A.token)).send({ body: '  Pode buscar! ' }).expect(200);
    expect(saved.body).toMatchObject({ status: 'READY', body: 'Pode buscar!', isCustom: true });
    // salvar de novo atualiza (não duplica)
    await api().put('/api/stores/message-templates/READY').set(auth(A.token)).send({ body: 'Chegou a hora!' }).expect(200);
    expect(await db('store_message_templates').where({ store_id: A.store.id }).count({ n: 'id' }).first()).toMatchObject({ n: 1 });

    await api().delete('/api/stores/message-templates/READY').set(auth(A.token)).expect(204);
    const after = (await api().get('/api/stores/message-templates').set(auth(A.token))).body.find((m) => m.status === 'READY');
    expect(after.isCustom).toBe(false);
  });

  it('valida status e texto', async () => {
    expect((await api().put('/api/stores/message-templates/RECEIVED').set(auth(A.token)).send({ body: 'x' })).status).toBe(400);
    expect((await api().put('/api/stores/message-templates/READY').set(auth(A.token)).send({ body: '   ' })).status).toBe(400);
    expect((await api().put('/api/stores/message-templates/READY').set(auth(A.token)).send({ body: 'a'.repeat(501) })).status).toBe(400);
  });

  it('a mensagem personalizada é a devolvida ao mudar o status; cada loja tem as suas', async () => {
    await api().put('/api/stores/message-templates/PREPARING').set(auth(A.token)).send({ body: 'Mão na massa!' }).expect(200);
    const order = (await api().post(`/api/public/stores/${A.store.slug}/orders`).send({
      fulfillment: 'PICKUP', name: 'Ana', phone: '35999990000', paymentMethodId: A.s.pix.id,
      items: [{ productId: A.s.burger.id, variantId: A.s.burger.variants[0].id, quantity: 1, options: [{ groupId: A.s.groups.ponto.id, optionId: A.s.opt(A.s.groups.ponto, 'Ao ponto') }] }],
    }).expect(201)).body;
    const res = await api().post(`/api/stores/orders/${order.id}/status`).set(auth(A.token)).send({ status: 'PREPARING' }).expect(200);
    expect(res.body.message).toBe('Mão na massa!');

    const B = await registerStore();
    const other = (await api().get('/api/stores/message-templates').set(auth(B.token))).body.find((m) => m.status === 'PREPARING');
    expect(other.isCustom).toBe(false);
  });
});

describe('Resumo de vendas', () => {
  const place = async (extra = {}) => (await api().post(`/api/public/stores/${A.store.slug}/orders`).send({
    fulfillment: 'PICKUP', name: 'Ana', phone: '35999990000', paymentMethodId: A.s.pix.id,
    items: [{ productId: A.s.burger.id, variantId: A.s.burger.variants[0].id, quantity: 2, options: [{ groupId: A.s.groups.ponto.id, optionId: A.s.opt(A.s.groups.ponto, 'Ao ponto') }] }],
    ...extra,
  })).body;

  it('exige login', async () => {
    expect((await api().get('/api/stores/reports/summary')).status).toBe(401);
  });

  it('sem pedidos devolve zeros e um registro por dia', async () => {
    const res = await api().get('/api/stores/reports/summary').set(auth(A.token)).expect(200);
    expect(res.body.totals).toMatchObject({ orders: 0, revenueCents: 0, averageTicketCents: 0 });
    expect(res.body.byDay).toHaveLength(7);
    expect(res.body.byHour).toHaveLength(24);
    expect(res.body.topProducts).toEqual([]);
  });

  it('soma vendas, separa cancelados e agrupa por produto, pagamento e dia', async () => {
    const o1 = await place();
    await place({ paymentMethodId: A.s.cash.id });
    const o3 = await place();
    await api().post(`/api/stores/orders/${o3.id}/status`).set(auth(A.token)).send({ status: 'CANCELED', reason: 'teste' }).expect(200);

    const res = (await api().get('/api/stores/reports/summary').set(auth(A.token)).expect(200)).body;
    const unit = o1.totalCents; // pedido de retirada: sem entrega
    expect(res.totals).toMatchObject({ orders: 2, revenueCents: unit * 2, averageTicketCents: unit, notSoldOrders: 1 });
    expect(res.byStatus).toMatchObject({ RECEIVED: 2, CANCELED: 1 });
    expect(res.byFulfillment).toEqual([{ fulfillment: 'PICKUP', orders: 2, revenueCents: unit * 2 }]);
    expect(res.byPayment.map((p) => p.name).sort()).toEqual(['Dinheiro', 'Pix']);
    expect(res.topProducts[0]).toMatchObject({ name: 'X-Bacon', quantity: 4, revenueCents: unit * 2 });
    expect(res.byDay.reduce((s, d) => s + d.orders, 0)).toBe(2);
    expect(res.byHour.reduce((s, h) => s + h.orders, 0)).toBe(2);
  });

  it('respeita o período e valida datas; não mistura lojas', async () => {
    await place();
    const future = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
    const later = new Date(Date.now() + 4 * 24 * 3600 * 1000).toISOString();
    const empty = await api().get('/api/stores/reports/summary').query({ from: future, to: later }).set(auth(A.token)).expect(200);
    expect(empty.body.totals.orders).toBe(0);

    expect((await api().get('/api/stores/reports/summary').query({ from: 'x' }).set(auth(A.token))).status).toBe(400);
    expect((await api().get('/api/stores/reports/summary').query({ from: later, to: future }).set(auth(A.token))).status).toBe(400);

    const B = await registerStore();
    expect((await api().get('/api/stores/reports/summary').set(auth(B.token))).body.totals.orders).toBe(0);
  });
});
