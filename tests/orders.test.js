import { describe, it, expect, beforeEach } from 'vitest';
import db from '../db/knex.js';
import { api, auth, registerStore, seedPizzaria } from './factories/helpers.js';

let A; // { token, store, s } — pizzaria aberta
beforeEach(async () => {
  const reg = await registerStore();
  A = { ...reg, s: await seedPizzaria(reg.token) };
});

const customer = { name: 'Maria', phone: '(35) 99999-1111' };

// pedido padrão: 2 pizzas Broto, 2 sabores (Calabresa + Portuguesa), borda Catupiry, adicional Bacon
const pizzaItem = (s, extra = {}) => ({
  productId: s.pizza.id, variantId: s.broto.id, quantity: 2,
  options: [
    { groupId: s.groups.sabores.id, optionId: s.opt(s.groups.sabores, 'Calabresa') },
    { groupId: s.groups.sabores.id, optionId: s.opt(s.groups.sabores, 'Portuguesa') },
    { groupId: s.groups.borda.id, optionId: s.opt(s.groups.borda, 'Catupiry') },
    { groupId: s.groups.extras.id, optionId: s.opt(s.groups.extras, 'Bacon') },
  ],
  ...extra,
});
const burgerItem = (s, quantity = 1) => ({
  productId: s.burger.id, variantId: s.burger.variants[0].id, quantity,
  options: [
    { groupId: s.groups.ponto.id, optionId: s.opt(s.groups.ponto, 'Ao ponto') },
    { groupId: s.groups.lancheExtras.id, optionId: s.opt(s.groups.lancheExtras, 'Bacon extra'), quantity: 2 },
  ],
});

const place = (body, slug = A.store.slug) => api().post(`/api/public/stores/${slug}/orders`).send(body);
const pickup = (items, extra = {}) => ({ fulfillment: 'PICKUP', ...customer, paymentMethodId: A.s.pix.id, items, ...extra });
const delivery = (items, extra = {}) => ({
  fulfillment: 'DELIVERY', ...customer, deliveryZoneId: A.s.zoneCentro.id, address: 'Rua A, 10', paymentMethodId: A.s.pix.id, items, ...extra,
});

describe('Criar pedido: preço calculado no servidor', () => {
  it('pizza meio a meio no broto: cobra o maior sabor + borda + adicional, x2', async () => {
    const res = await place(delivery([pizzaItem(A.s)]));
    expect(res.status).toBe(201);

    // (50,00 maior sabor + 8,00 borda + 5,00 bacon) x 2 = 126,00 + 5,00 de entrega
    expect(res.body).toMatchObject({ status: 'RECEIVED', orderNumber: 1, subtotalCents: 12600, deliveryFeeCents: 500, totalCents: 13100 });
    const item = res.body.items[0];
    expect(item).toMatchObject({ productName: 'Pizza', variantName: 'Broto', unitPriceCents: 0, optionsTotalCents: 6300, quantity: 2, lineTotalCents: 12600 });

    const byName = Object.fromEntries(item.options.map((o) => [o.optionName, o]));
    expect(byName.Calabresa).toMatchObject({ groupName: 'Sabores', listPriceCents: 4500, chargedCents: 0 });
    expect(byName.Portuguesa).toMatchObject({ listPriceCents: 5000, chargedCents: 5000 });
    expect(byName.Catupiry).toMatchObject({ chargedCents: 800 });
    expect(byName.Bacon).toMatchObject({ chargedCents: 500 });
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0].status).toBe('RECEIVED');
  });

  it('o mesmo pedido no tamanho grande usa os preços do grande', async () => {
    const item = pizzaItem(A.s, { variantId: A.s.grande.id, quantity: 1 });
    const res = await place(pickup([item]));
    // 70,00 + 12,00 borda + 8,00 bacon
    expect(res.body.totalCents).toBe(9000);
  });

  it('mistura itens: pizza + hambúrguer com adicional repetido + refrigerante', async () => {
    const soda = { productId: A.s.soda.id, variantId: A.s.soda.variants[1].id, quantity: 1 };
    const res = await place(pickup([pizzaItem(A.s, { quantity: 1 }), burgerItem(A.s, 2), soda]));
    expect(res.status).toBe(201);
    // pizza 63,00 + 2 x (28,00 + 2 x 5,00) + 14,00
    expect(res.body.subtotalCents).toBe(6300 + 7600 + 1400);
    const burger = res.body.items.find((i) => i.productName === 'X-Bacon');
    expect(burger.options.find((o) => o.optionName === 'Bacon extra')).toMatchObject({ quantity: 2, chargedCents: 1000 });
  });

  it('ignora qualquer preço enviado pelo cliente', async () => {
    const tampered = { ...pickup([{ ...pizzaItem(A.s), total: 1, priceCents: 1, unitPriceCents: 1 }]), total: 1, totalCents: 1, subtotalCents: 1, discountCents: 99999 };
    const res = await place(tampered);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ subtotalCents: 12600, discountCents: 0, totalCents: 12600 });
  });

  it('numera os pedidos em sequência por loja', async () => {
    const other = await registerStore();
    const os = await seedPizzaria(other.token);
    const otherOrder = await place({ ...pickup([burgerItem(A.s)]), paymentMethodId: os.pix.id, items: [burgerItem(os)] }, other.store.slug);

    const first = await place(pickup([burgerItem(A.s)]));
    const second = await place(pickup([burgerItem(A.s)]));
    expect([first.body.orderNumber, second.body.orderNumber]).toEqual([1, 2]);
    expect(otherOrder.body.orderNumber).toBe(1); // a outra loja tem a sua própria contagem
  });

  it('pedidos simultâneos recebem números diferentes', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => place(pickup([burgerItem(A.s)]))));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.orderNumber)).size).toBe(8);
  });

  it('o id de acompanhamento é aleatório e o cliente fica cadastrado uma vez por telefone', async () => {
    const a = await place(pickup([burgerItem(A.s)]));
    const b = await place(pickup([burgerItem(A.s)], { name: 'Maria S.' }));
    expect(a.body.publicId).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.body.publicId).not.toBe(b.body.publicId);

    const customers = await db('customers').where({ store_id: A.store.id });
    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({ phone: '35999991111', name: 'Maria S.' });
  });
});

describe('Criar pedido: regras e recusas', () => {
  it('loja fechada não recebe pedido (409)', async () => {
    await api().patch('/api/stores/me/status').set(auth(A.token)).send({ isOpen: false }).expect(200);
    const res = await place(pickup([burgerItem(A.s)]));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STORE_CLOSED');
  });

  it('entrega exige bairro e endereço; bairro de outra loja ou inativo é recusado', async () => {
    const noZone = await place({ ...delivery([burgerItem(A.s)]), deliveryZoneId: undefined });
    expect(noZone.status).toBe(400);
    const noAddress = await place({ ...delivery([burgerItem(A.s)]), address: '' });
    expect(noAddress.status).toBe(400);

    const other = await registerStore();
    const zoneB = (await api().post('/api/stores/delivery-zones').set(auth(other.token)).send({ district: 'Centro', feeCents: 100 })).body;
    expect((await place(delivery([burgerItem(A.s)], { deliveryZoneId: zoneB.id }))).status).toBe(422);

    await api().patch(`/api/stores/delivery-zones/${A.s.zoneCentro.id}`).set(auth(A.token)).send({ active: false }).expect(200);
    expect((await place(delivery([burgerItem(A.s)]))).status).toBe(422);
  });

  it('retirada não cobra entrega nem guarda endereço', async () => {
    const res = await place(pickup([burgerItem(A.s)], { deliveryZoneId: A.s.zoneCentro.id, address: 'Rua X' }));
    expect(res.body).toMatchObject({ deliveryFeeCents: 0, delivery: null });
  });

  it('troco: só em dinheiro e precisa cobrir o total', async () => {
    const total = 2800 + 1000; // 1 X-Bacon com 2x bacon extra
    const low = await place(pickup([burgerItem(A.s)], { paymentMethodId: A.s.cash.id, cashChangeForCents: total - 1 }));
    expect(low.status).toBe(422);
    const ok = await place(pickup([burgerItem(A.s)], { paymentMethodId: A.s.cash.id, cashChangeForCents: 5000 }));
    expect(ok.body.payment).toEqual({ name: 'Dinheiro', type: 'CASH', cashChangeForCents: 5000 });
    // em Pix o troco é ignorado
    const pix = await place(pickup([burgerItem(A.s)], { cashChangeForCents: 5000 }));
    expect(pix.body.payment.cashChangeForCents).toBeNull();
  });

  it('forma de pagamento inativa ou de outra loja é recusada', async () => {
    await api().patch(`/api/stores/payment-methods/${A.s.pix.id}`).set(auth(A.token)).send({ active: false }).expect(200);
    expect((await place(pickup([burgerItem(A.s)]))).status).toBe(422);
  });

  it.each([
    ['faltou o grupo obrigatório (ponto da carne)', () => ({ productId: A.s.burger.id, variantId: A.s.burger.variants[0].id, quantity: 1, options: [] }), 'GROUP_MIN'],
    ['3 sabores numa pizza', () => pizzaItem(A.s, { options: ['Calabresa', 'Mussarela', 'Portuguesa'].map((n) => ({ groupId: A.s.groups.sabores.id, optionId: A.s.opt(A.s.groups.sabores, n) })) }), 'GROUP_MAX'],
    ['mesmo sabor duas vezes', () => pizzaItem(A.s, { options: [1, 2].map(() => ({ groupId: A.s.groups.sabores.id, optionId: A.s.opt(A.s.groups.sabores, 'Calabresa') })) }), 'OPTION_MAX'],
    ['3x o mesmo adicional (máx. 2)', () => ({ ...burgerItem(A.s), options: [{ groupId: A.s.groups.ponto.id, optionId: A.s.opt(A.s.groups.ponto, 'Ao ponto') }, { groupId: A.s.groups.lancheExtras.id, optionId: A.s.opt(A.s.groups.lancheExtras, 'Bacon extra'), quantity: 3 }] }), 'OPTION_MAX'],
    ['grupo que não é do produto (borda no hambúrguer)', () => ({ ...burgerItem(A.s), options: [...burgerItem(A.s).options, { groupId: A.s.groups.borda.id, optionId: A.s.opt(A.s.groups.borda, 'Catupiry') }] }), 'GROUP_NOT_ALLOWED'],
    ['variação de outro produto', () => pizzaItem(A.s, { variantId: A.s.burger.variants[0].id }), 'VARIANT_UNAVAILABLE'],
    ['produto inexistente', () => pizzaItem(A.s, { productId: 999999 }), 'PRODUCT_UNAVAILABLE'],
  ])('recusa (422): %s', async (_nome, makeItem, code) => {
    const res = await place(pickup([makeItem()]));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe(code);
    expect(await db('orders').count({ n: 'id' }).first().then((r) => Number(r.n))).toBe(0); // nada foi gravado
  });

  it('recusa opção, variação e produto desativados', async () => {
    const calabresa = A.s.opt(A.s.groups.sabores, 'Calabresa');
    await api().patch(`/api/stores/options/${calabresa}`).set(auth(A.token)).send({ active: false }).expect(200);
    expect((await place(pickup([pizzaItem(A.s)]))).body.code).toBe('OPTION_UNAVAILABLE');
    await api().patch(`/api/stores/options/${calabresa}`).set(auth(A.token)).send({ active: true }).expect(200);

    await api().patch(`/api/stores/products/${A.s.pizza.id}/variants/${A.s.broto.id}`).set(auth(A.token)).send({ active: false }).expect(200);
    expect((await place(pickup([pizzaItem(A.s)]))).body.code).toBe('VARIANT_UNAVAILABLE');

    await api().patch(`/api/stores/products/${A.s.burger.id}`).set(auth(A.token)).send({ active: false }).expect(200);
    expect((await place(pickup([burgerItem(A.s)]))).body.code).toBe('PRODUCT_UNAVAILABLE');
  });

  it('valida o formato do corpo (400)', async () => {
    expect((await place({})).status).toBe(400);
    expect((await place(pickup([]))).status).toBe(400);
    expect((await place(pickup([{ ...burgerItem(A.s), quantity: 0 }]))).status).toBe(400);
    expect((await place(pickup([burgerItem(A.s)], { phone: '123' }))).status).toBe(400);
    expect((await place(pickup([burgerItem(A.s)], { fulfillment: 'VOANDO' }))).status).toBe(400);
  });

  it('loja inexistente: 404', async () => {
    expect((await place(pickup([burgerItem(A.s)]), 'nao-existe')).status).toBe(404);
  });

  it('o item não aceita opção de grupo de outra loja', async () => {
    const other = await registerStore();
    const os = await seedPizzaria(other.token);
    const stolen = { ...burgerItem(A.s), options: [{ groupId: os.groups.ponto.id, optionId: os.opt(os.groups.ponto, 'Ao ponto') }] };
    expect((await place(pickup([stolen]))).status).toBe(422);
  });
});

describe('Histórico: o pedido guarda uma fotografia', () => {
  it('mudar preço, renomear ou apagar o produto não altera o pedido já feito', async () => {
    const created = await place(pickup([pizzaItem(A.s, { quantity: 1 })]));
    expect(created.body.totalCents).toBe(6300);

    await api().patch(`/api/stores/products/${A.s.pizza.id}`).set(auth(A.token)).send({ name: 'Pizza Premium' }).expect(200);
    const calabresa = A.s.groups.sabores.options.find((o) => o.name === 'Calabresa');
    await api().patch(`/api/stores/options/${calabresa.id}`).set(auth(A.token)).send({ prices: { [A.s.broto.id]: 99900 } }).expect(200);
    await api().delete(`/api/stores/products/${A.s.pizza.id}`).set(auth(A.token)).expect(204);

    const res = await api().get(`/api/stores/orders/${created.body.id}`).set(auth(A.token));
    expect(res.status).toBe(200);
    expect(res.body.totalCents).toBe(6300);
    expect(res.body.items[0]).toMatchObject({ productName: 'Pizza', variantName: 'Broto', productId: null });
    expect(res.body.items[0].options.find((o) => o.optionName === 'Calabresa').listPriceCents).toBe(4500);
  });
});

describe('Acompanhamento público', () => {
  it('mostra status e itens, mas não o telefone', async () => {
    const created = await place(delivery([burgerItem(A.s)]));
    const res = await api().get(`/api/public/orders/${created.body.publicId}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ orderNumber: 1, status: 'RECEIVED', customer: { name: 'Maria' }, store: { slug: A.store.slug } });
    expect(JSON.stringify(res.body)).not.toContain('35999991111');
    expect((await api().get('/api/public/orders/id-que-nao-existe')).status).toBe(404);
  });
});

describe('Pedidos no painel da loja', () => {
  it('lista os pedidos do turno e filtra por status; exige login', async () => {
    const a = await place(pickup([burgerItem(A.s)]));
    await place(pickup([burgerItem(A.s)]));
    await api().post(`/api/stores/orders/${a.body.id}/status`).set(auth(A.token)).send({ status: 'PREPARING' }).expect(200);

    const all = await api().get('/api/stores/orders').set(auth(A.token));
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ page: 1, total: 2 });
    expect(all.body.orders.map((o) => o.orderNumber)).toEqual([2, 1]); // mais recente primeiro
    expect(all.body.orders[0].items[0].options.length).toBeGreaterThan(0);

    const preparing = await api().get('/api/stores/orders?status=PREPARING').set(auth(A.token));
    expect(preparing.body.orders.map((o) => o.orderNumber)).toEqual([1]);

    expect((await api().get('/api/stores/orders?status=XYZ').set(auth(A.token))).status).toBe(400);
    expect((await api().get('/api/stores/orders')).status).toBe(401);
  });

  it('o turno começa quando a loja abre: pedidos de antes não aparecem', async () => {
    const old = await place(pickup([burgerItem(A.s)]));
    await db('orders').where({ id: old.body.id }).update({ created_at: new Date(Date.now() - 3 * 3600 * 1000) });
    await db('stores').where({ id: A.store.id }).update({ opened_at: new Date(Date.now() - 3600 * 1000) });
    await place(pickup([burgerItem(A.s)]));

    const shift = await api().get('/api/stores/orders').set(auth(A.token));
    expect(shift.body.total).toBe(1);
    const everything = await api().get('/api/stores/orders?scope=all').set(auth(A.token));
    expect(everything.body.total).toBe(2);
  });

  it('uma loja nunca vê nem altera pedidos de outra', async () => {
    const created = await place(pickup([burgerItem(A.s)]));
    const b = await registerStore();

    expect((await api().get('/api/stores/orders?scope=all').set(auth(b.token))).body.total).toBe(0);
    expect((await api().get(`/api/stores/orders/${created.body.id}`).set(auth(b.token))).status).toBe(404);
    expect((await api().post(`/api/stores/orders/${created.body.id}/status`).set(auth(b.token)).send({ status: 'PREPARING' })).status).toBe(404);
    expect((await db('orders').where({ id: created.body.id }).first()).status).toBe('RECEIVED');
  });
});

describe('Fluxo de status', () => {
  const setStatus = (id, status, reason) => api().post(`/api/stores/orders/${id}/status`).set(auth(A.token)).send({ status, reason });

  it('entrega: RECEIVED > PREPARING > OUT_FOR_DELIVERY > DELIVERED, com histórico e mensagem do WhatsApp', async () => {
    await db('store_message_templates').insert({ store_id: A.store.id, status: 'OUT_FOR_DELIVERY', body: 'Oba, o seu pedido já está a caminho!' });
    const o = (await place(delivery([burgerItem(A.s)]))).body;

    expect((await setStatus(o.id, 'PREPARING')).status).toBe(200);
    const onTheWay = await setStatus(o.id, 'OUT_FOR_DELIVERY');
    expect(onTheWay.body.message).toBe('Oba, o seu pedido já está a caminho!');
    const done = await setStatus(o.id, 'DELIVERED');
    expect(done.body.order.status).toBe('DELIVERED');
    expect(done.body.message).toMatch(/entregue/i); // sem personalização: texto padrão
    expect(done.body.order.history.map((h) => h.status)).toEqual(['RECEIVED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED']);
  });

  it('retirada: PREPARING > READY > PICKED_UP', async () => {
    const o = (await place(pickup([burgerItem(A.s)]))).body;
    await setStatus(o.id, 'PREPARING').then((r) => expect(r.status).toBe(200));
    await setStatus(o.id, 'READY').then((r) => expect(r.status).toBe(200));
    await setStatus(o.id, 'PICKED_UP').then((r) => expect(r.body.order.status).toBe('PICKED_UP'));
  });

  it('recusa transições fora do fluxo (409)', async () => {
    const d = (await place(delivery([burgerItem(A.s)]))).body;
    const p = (await place(pickup([burgerItem(A.s)]))).body;

    expect((await setStatus(d.id, 'DELIVERED')).status).toBe(409);        // pulou etapas
    await setStatus(d.id, 'PREPARING');
    expect((await setStatus(d.id, 'READY')).status).toBe(409);            // READY é só retirada
    expect((await setStatus(p.id, 'PREPARING')).status).toBe(200);
    expect((await setStatus(p.id, 'OUT_FOR_DELIVERY')).status).toBe(409); // OUT_FOR_DELIVERY é só entrega
    expect((await setStatus(d.id, 'RECEIVED')).status).toBe(400);         // não se volta para RECEIVED
  });

  it('status finais não mudam mais', async () => {
    const o = (await place(pickup([burgerItem(A.s)]))).body;
    await setStatus(o.id, 'REJECTED', 'Sem ingredientes');
    expect((await setStatus(o.id, 'PREPARING')).status).toBe(409);
    expect((await setStatus(o.id, 'CANCELED', 'x')).status).toBe(409);
  });

  it('rejeitar e cancelar exigem motivo, que fica no histórico', async () => {
    const o = (await place(pickup([burgerItem(A.s)]))).body;
    expect((await setStatus(o.id, 'REJECTED')).status).toBe(422);
    expect((await setStatus(o.id, 'REJECTED', '   ')).status).toBe(422);
    const res = await setStatus(o.id, 'REJECTED', 'Sem ingredientes');
    expect(res.status).toBe(200);
    expect(res.body.order.history.at(-1)).toMatchObject({ status: 'REJECTED', reason: 'Sem ingredientes' });
  });

  it('dois cliques ao mesmo tempo: só um vence', async () => {
    const o = (await place(pickup([burgerItem(A.s)]))).body;
    const [x, y] = await Promise.all([setStatus(o.id, 'PREPARING'), setStatus(o.id, 'REJECTED', 'motivo')]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    const history = await db('order_status_history').where({ order_id: o.id });
    expect(history).toHaveLength(2); // RECEIVED + a transição que venceu
  });
});
