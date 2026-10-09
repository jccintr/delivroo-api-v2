import request from 'supertest';
import app from '../../app.js';
import db from '../../db/knex.js';

export const api = () => request(app);

export const auth = (token) => ({ Authorization: `Bearer ${token}` });

export async function createCity(overrides = {}) {
  const tag = Math.random().toString(36).slice(2, 8);
  const [id] = await db('cities').insert({ name: `Cidade ${tag}`, state: 'MG', slug: `cidade-${tag}-mg`, ...overrides });
  return db('cities').where({ id }).first();
}

let counter = 0;
// Cadastra uma loja pela própria API e devolve { token, store, cityId }
export async function registerStore(overrides = {}) {
  const city = overrides.cityId ? { id: overrides.cityId } : await createCity();
  counter += 1;
  const res = await api().post('/api/stores/register').send({
    name: `Loja Teste ${counter}`,
    email: `loja${counter}-${Date.now()}@teste.com`,
    password: '123456',
    phone: '35999999999',
    cityId: city.id,
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`registerStore falhou: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token, store: res.body.store, cityId: city.id };
}

const post = async (token, url, body) => {
  const res = await api().post(url).set(auth(token)).send(body);
  if (res.status >= 300) throw new Error(`POST ${url} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
};

// Monta a pizzaria do seed.sql pela API: pizza (Broto/Grande, sabores HIGHEST, borda, adicionais),
// X-Bacon (ponto obrigatório + adicionais repetíveis) e refrigerante. Loja aberta, com entrega e pagamentos.
export async function seedPizzaria(token) {
  const zoneCentro = await post(token, '/api/stores/delivery-zones', { district: 'Centro', feeCents: 500 });
  // toda loja nasce com as formas de pagamento padrão (Pix, dinheiro e cartões)
  const payments = (await api().get('/api/stores/payment-methods').set(auth(token)).expect(200)).body;
  const pix = payments.find((m) => m.type === 'PIX');
  const cash = payments.find((m) => m.type === 'CASH');

  const catPizza = await post(token, '/api/stores/categories', { name: 'Pizzas', position: 1 });
  const catBurger = await post(token, '/api/stores/categories', { name: 'Hambúrgueres', position: 2 });
  const catDrinks = await post(token, '/api/stores/categories', { name: 'Bebidas', position: 3 });

  const pizza = await post(token, '/api/stores/products', {
    categoryId: catPizza.id, name: 'Pizza', description: 'Escolha o tamanho, até 2 sabores e a borda.',
    variants: [{ name: 'Broto', priceCents: 0 }, { name: 'Grande', priceCents: 0 }],
  });
  const [broto, grande] = pizza.variants;
  const burger = await post(token, '/api/stores/products', {
    categoryId: catBurger.id, name: 'X-Bacon', variants: [{ name: 'Único', priceCents: 2800 }],
  });
  const soda = await post(token, '/api/stores/products', {
    categoryId: catDrinks.id, name: 'Refrigerante', variants: [{ name: 'Lata 350 ml', priceCents: 600 }, { name: '2 L', priceCents: 1400 }],
  });

  const sabores = await post(token, '/api/stores/option-groups', {
    name: 'Sabores', minSelect: 1, maxSelect: 2, maxPerOption: 1, pricingMode: 'HIGHEST',
    options: [{ name: 'Calabresa' }, { name: 'Mussarela' }, { name: 'Portuguesa' }],
  });
  const price = { Calabresa: [4500, 6500], Mussarela: [4000, 6000], Portuguesa: [5000, 7000] };
  for (const o of sabores.options) {
    await api().patch(`/api/stores/options/${o.id}`).set(auth(token))
      .send({ prices: { [broto.id]: price[o.name][0], [grande.id]: price[o.name][1] } }).expect(200);
  }
  const borda = await post(token, '/api/stores/option-groups', {
    name: 'Borda', minSelect: 0, maxSelect: 1, options: [{ name: 'Catupiry' }, { name: 'Cheddar' }],
  });
  const bordaPrice = { Catupiry: [800, 1200], Cheddar: [700, 1100] };
  for (const o of borda.options) {
    await api().patch(`/api/stores/options/${o.id}`).set(auth(token))
      .send({ prices: { [broto.id]: bordaPrice[o.name][0], [grande.id]: bordaPrice[o.name][1] } }).expect(200);
  }
  const extras = await post(token, '/api/stores/option-groups', {
    name: 'Adicionais da pizza', minSelect: 0, maxSelect: 5, options: [{ name: 'Bacon' }, { name: 'Cebola' }],
  });
  const extraPrice = { Bacon: [500, 800], Cebola: [300, 500] };
  for (const o of extras.options) {
    await api().patch(`/api/stores/options/${o.id}`).set(auth(token))
      .send({ prices: { [broto.id]: extraPrice[o.name][0], [grande.id]: extraPrice[o.name][1] } }).expect(200);
  }
  const ponto = await post(token, '/api/stores/option-groups', {
    name: 'Ponto da carne', minSelect: 1, maxSelect: 1, options: [{ name: 'Mal passado' }, { name: 'Ao ponto' }, { name: 'Bem passado' }],
  });
  const lancheExtras = await post(token, '/api/stores/option-groups', {
    name: 'Adicionais do lanche', minSelect: 0, maxSelect: 6, maxPerOption: 2,
    options: [{ name: 'Bacon extra', priceCents: 500 }, { name: 'Cheddar extra', priceCents: 400 }],
  });

  const link = (productId, groupIds) =>
    api().put(`/api/stores/products/${productId}/option-groups`).set(auth(token)).send({ groupIds }).expect(200);
  await link(pizza.id, [sabores.id, borda.id, extras.id]);
  await link(burger.id, [ponto.id, lancheExtras.id]);

  await api().patch('/api/stores/me/status').set(auth(token)).send({ isOpen: true }).expect(200);

  const opt = (group, name) => group.options.find((o) => o.name === name).id;
  return {
    zoneCentro, pix, cash, pizza, burger, soda, broto, grande,
    groups: { sabores, borda, extras, ponto, lancheExtras },
    opt,
  };
}

// ---- backoffice (admin geral) ----
let adminCounter = 0;
// Cria um admin direto no banco e devolve { admin, password, token } (token já logado pela API).
export async function createAdminUser(overrides = {}) {
  const bcryptjs = (await import('bcryptjs')).default;
  adminCounter += 1;
  const password = overrides.password ?? 'senha-admin-123';
  const email = overrides.email ?? `admin${adminCounter}-${Date.now()}@delivroo.test`;
  const { password: _ignored, ...rest } = overrides;
  const [id] = await db('admins').insert({
    name: `Admin ${adminCounter}`, email, password_hash: await bcryptjs.hash(password, 4), ...rest,
  });
  const admin = await db('admins').where({ id }).first();
  let token = null;
  if (admin.active) {
    const res = await api().post('/api/admin/login').send({ email, password });
    if (res.status !== 200) throw new Error(`login do admin falhou: ${res.status} ${JSON.stringify(res.body)}`);
    token = res.body.token;
  }
  return { admin, email, password, token };
}
