import { describe, it, expect } from 'vitest';
import db from '../db/knex.js';
import { EMPTY_CHOICE, TEMPLATES, TEMPLATE_KEYS } from '../templates/index.js';
import { DEFAULT_PAYMENT_METHODS } from '../services/template.service.js';
import { api, auth, createCity } from './factories/helpers.js';

// ------------------------------------------------------------------------------------------------
// Consistência dos templates (sem banco): erro de digitação num template aparece aqui, não na loja do cliente.
// ------------------------------------------------------------------------------------------------
describe('templates de cardápio: consistência dos dados', () => {
  it('existem pizzaria, hamburgueria e açaí', () => {
    expect(TEMPLATE_KEYS).toEqual(expect.arrayContaining(['pizzaria', 'hamburgueria', 'acai']));
    expect(TEMPLATE_KEYS).not.toContain(EMPTY_CHOICE.key);
  });

  for (const key of Object.keys(TEMPLATES)) {
    const t = TEMPLATES[key];

    describe(key, () => {
      const products = t.catalog.flatMap((c) => c.products);

      it('tem identificação e conteúdo', () => {
        expect(t.key).toBe(key);
        expect(t.name).toBeTruthy();
        expect(t.description).toBeTruthy();
        expect(t.catalog.length).toBeGreaterThanOrEqual(3);
        expect(products.length).toBeGreaterThanOrEqual(8);
        for (const c of t.catalog) expect(c.products.length, c.category).toBeGreaterThan(0);
      });

      it('não repete nome de categoria nem de produto dentro da categoria; limites dos campos', () => {
        expect(new Set(t.catalog.map((c) => c.category)).size).toBe(t.catalog.length);
        for (const c of t.catalog) {
          expect(new Set(c.products.map((p) => p.name)).size, c.category).toBe(c.products.length);
          expect(c.category.length).toBeLessThanOrEqual(80);
          for (const p of c.products) {
            expect(p.name.length, p.name).toBeLessThanOrEqual(120);
            expect((p.description ?? '').length, p.name).toBeLessThanOrEqual(500);
          }
        }
      });

      it('preços em centavos inteiros e todo produto tem ao menos uma variação', () => {
        for (const p of products) {
          expect(p.variants.length, p.name).toBeGreaterThan(0);
          expect(new Set(p.variants.map((v) => v.name)).size, p.name).toBe(p.variants.length);
          for (const v of p.variants) {
            expect(Number.isInteger(v.price) && v.price >= 0, `${p.name}/${v.name}`).toBe(true);
            expect(v.name.length).toBeLessThanOrEqual(60);
            expect((v.description ?? '').length).toBeLessThanOrEqual(120);
          }
        }
      });

      it('todo produto usa só grupos que existem e todo grupo é usado por algum produto', () => {
        const used = new Set();
        for (const p of products) {
          for (const g of p.groups) {
            expect(t.groups[g], `${p.name} usa o grupo inexistente "${g}"`).toBeDefined();
            used.add(g);
          }
          expect(new Set(p.groups).size, p.name).toBe(p.groups.length);
        }
        expect([...used].sort()).toEqual(Object.keys(t.groups).sort());
      });

      it('grupos têm limites coerentes com as opções', () => {
        for (const [gk, g] of Object.entries(t.groups)) {
          expect(g.name.length).toBeLessThanOrEqual(80);
          expect(['ADDITIVE', 'HIGHEST']).toContain(g.mode);
          expect(g.min, gk).toBeGreaterThanOrEqual(0);
          expect(g.max, gk).toBeGreaterThanOrEqual(Math.max(g.min, 1));
          expect(g.options.length, gk).toBeGreaterThanOrEqual(g.min);
          expect(g.options.length * (g.perOption ?? 1), `${gk}: max maior que o possível`).toBeGreaterThanOrEqual(g.max);
          expect(new Set(g.options.map((o) => o[0])).size, gk).toBe(g.options.length);
          expect(g.options.filter((o) => o[3]).length, `${gk}: mais de uma opção padrão`).toBeLessThanOrEqual(1);
        }
      });

      it('preço por tamanho cobre exatamente as variações de TODO produto que usa o grupo', () => {
        for (const [gk, g] of Object.entries(t.groups)) {
          const users = products.filter((p) => p.groups.includes(gk));
          for (const [name, , price] of g.options) {
            if (typeof price === 'number') {
              expect(Number.isInteger(price) && price >= 0, `${gk}/${name}`).toBe(true);
              continue;
            }
            for (const p of users) {
              const sizes = p.variants.map((v) => v.name).sort();
              expect(Object.keys(price).sort(), `${gk}/${name} em "${p.name}"`).toEqual(sizes);
            }
            for (const cents of Object.values(price)) expect(Number.isInteger(cents) && cents >= 0).toBe(true);
          }
        }
      });
    });
  }
});

// ------------------------------------------------------------------------------------------------
// API
// ------------------------------------------------------------------------------------------------
const newStore = async (extra = {}) => {
  const city = await createCity();
  const email = `t-${Math.random().toString(36).slice(2, 10)}@teste.com`;
  return api().post('/api/stores/register').send({
    name: 'Loja de Template', email, password: '123456', phone: '35999999999', cityId: city.id, ...extra,
  });
};

describe('GET /api/stores/templates', () => {
  it('é público e lista "Loja vazia" primeiro, depois os templates com resumo', async () => {
    const res = await api().get('/api/stores/templates').expect(200);
    expect(res.body[0]).toMatchObject({ key: 'empty', categories: 0, products: 0 });
    expect(res.body.map((t) => t.key)).toEqual(['empty', ...TEMPLATE_KEYS]);
    for (const t of res.body.slice(1)) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.categories).toBe(TEMPLATES[t.key].catalog.length);
      expect(t.products).toBe(TEMPLATES[t.key].catalog.flatMap((c) => c.products).length);
    }
  });
});

describe('cadastro de loja: padrões e templates', () => {
  it('sem template (ou "empty"): loja vazia, mas com as formas de pagamento padrão', async () => {
    for (const extra of [{}, { template: 'empty' }, { template: '' }, { template: null }]) {
      const res = await newStore(extra);
      expect(res.status, JSON.stringify(extra)).toBe(201);
      expect(res.body.template).toBeNull();
      const token = res.body.token;

      expect((await api().get('/api/stores/categories').set(auth(token))).body).toHaveLength(0);
      expect((await api().get('/api/stores/products').set(auth(token))).body).toHaveLength(0);
      expect((await api().get('/api/stores/option-groups').set(auth(token))).body).toHaveLength(0);

      const payments = (await api().get('/api/stores/payment-methods').set(auth(token))).body;
      expect(payments.map((m) => [m.name, m.type])).toEqual(expect.arrayContaining(DEFAULT_PAYMENT_METHODS));
      expect(payments).toHaveLength(DEFAULT_PAYMENT_METHODS.length);
    }
  });

  it('template desconhecido é recusado (400) e não cria a loja', async () => {
    const res = await newStore({ template: 'sorveteria' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.details)).toContain('Template inválido');
    expect(await db('stores').count({ n: 'id' }).first()).toMatchObject({ n: 0 });
  });

  for (const key of TEMPLATE_KEYS) {
    it(`template "${key}": cria categorias, produtos, grupos e opções; cardápio público consistente`, async () => {
      const t = TEMPLATES[key];
      const expectedProducts = t.catalog.flatMap((c) => c.products);

      const res = await newStore({ template: key });
      expect(res.status).toBe(201);
      expect(res.body.template).toBe(key);
      const { token } = res.body;

      // painel da loja
      const cats = (await api().get('/api/stores/categories').set(auth(token))).body;
      expect(cats.map((c) => c.name)).toEqual(t.catalog.map((c) => c.category)); // na ordem do template
      expect(cats.every((c) => c.active)).toBe(true);
      const prods = (await api().get('/api/stores/products').set(auth(token))).body;
      expect(prods).toHaveLength(expectedProducts.length);
      expect(prods.every((p) => p.active)).toBe(true); // começam ativos (o painel avisa para revisar preços)
      const groups = (await api().get('/api/stores/option-groups').set(auth(token))).body;
      expect(groups.map((g) => g.name).sort()).toEqual(Object.values(t.groups).map((g) => g.name).sort());

      // pagamentos padrão também vêm junto
      expect((await api().get('/api/stores/payment-methods').set(auth(token))).body).toHaveLength(DEFAULT_PAYMENT_METHODS.length);

      // cardápio público
      const menu = (await api().get(`/api/public/stores/${res.body.store.slug}/menu`).expect(200)).body;
      expect(menu.store.isOpen).toBe(false); // a loja só abre quando o dono abrir
      expect(menu.categories.map((c) => c.name)).toEqual(t.catalog.map((c) => c.category));
      for (const c of menu.categories) {
        const tc = t.catalog.find((x) => x.category === c.name);
        expect(c.products.map((p) => p.name)).toEqual(tc.products.map((p) => p.name));
        for (const p of c.products) {
          const tp = tc.products.find((x) => x.name === p.name);
          expect(p.variants.map((v) => [v.name, v.priceCents]), p.name).toEqual(tp.variants.map((v) => [v.name, v.price]));
          expect(p.optionGroups.map((g) => g.name), p.name).toEqual(tp.groups.map((g) => t.groups[g].name));

          for (const g of p.optionGroups) {
            const tg = Object.values(t.groups).find((x) => x.name === g.name);
            expect([g.minSelect, g.maxSelect, g.maxPerOption, g.pricingMode]).toEqual([tg.min, tg.max, tg.perOption ?? 1, tg.mode]);
            expect(g.options.map((o) => o.name)).toEqual(tg.options.map((o) => o[0]));
            for (const o of g.options) {
              const [, , price, isDefault] = tg.options.find((x) => x[0] === o.name);
              expect(o.isDefault).toBe(!!isDefault);
              // preço resolvido para CADA variação do produto
              for (const v of p.variants) {
                const expected = typeof price === 'number' ? price : price[v.name];
                expect(o.prices[v.id], `${p.name}/${g.name}/${o.name}/${v.name}`).toBe(expected);
              }
            }
          }
        }
      }
    });
  }

  it('lojas diferentes com o mesmo template não misturam dados', async () => {
    const a = await newStore({ template: 'pizzaria', name: 'Pizza A' });
    const b = await newStore({ template: 'pizzaria', name: 'Pizza B' });
    const count = (token) => api().get('/api/stores/products').set(auth(token)).then((r) => r.body.length);
    const n = TEMPLATES.pizzaria.catalog.flatMap((c) => c.products).length;
    expect(await count(a.body.token)).toBe(n);
    expect(await count(b.body.token)).toBe(n);
    expect((await db('products').count({ n: 'id' }).first()).n).toBe(2 * n);
  });

  it('se o template falhar no meio, a loja não é criada (transação)', async () => {
    const pizzaria = TEMPLATES.pizzaria;
    const broken = { name: 'Produto quebrado', description: null, variants: [{ name: 'Único', price: 100 }], groups: ['nao-existe'] };
    pizzaria.catalog[0].products.push(broken);
    const spy = console.error;
    console.error = () => {}; // o erro 500 é esperado aqui
    try {
      const res = await newStore({ template: 'pizzaria', email: 'quebrada@teste.com' });
      expect(res.status).toBe(500);
    } finally {
      console.error = spy;
      pizzaria.catalog[0].products.pop();
    }
    expect(await db('stores').where({ email: 'quebrada@teste.com' }).first()).toBeUndefined();
    expect((await db('products').count({ n: 'id' }).first()).n).toBe(0);
    expect((await db('option_groups').count({ n: 'id' }).first()).n).toBe(0);
    expect((await db('payment_methods').count({ n: 'id' }).first()).n).toBe(0);
  });
});

// ------------------------------------------------------------------------------------------------
// Pedido de ponta a ponta em loja criada por template: prova que os preços por tamanho funcionam no cálculo do servidor
// ------------------------------------------------------------------------------------------------
describe('pedido numa loja criada por template', () => {
  const openAndMenu = async (key) => {
    const res = await newStore({ template: key });
    const { token, store } = res.body;
    await api().patch('/api/stores/me/status').set(auth(token)).send({ isOpen: true }).expect(200);
    const menu = (await api().get(`/api/public/stores/${store.slug}/menu`).expect(200)).body;
    const pix = menu.paymentMethods.find((m) => m.type === 'PIX');
    const find = (cat, prod) => menu.categories.find((c) => c.name === cat).products.find((p) => p.name === prod);
    const order = (items) =>
      api().post(`/api/public/stores/${store.slug}/orders`).send({ fulfillment: 'PICKUP', name: 'Maria', phone: '35999990000', paymentMethodId: pix.id, items });
    return { find, order };
  };

  it('pizzaria: meio a meio cobra o sabor mais caro + borda do tamanho escolhido', async () => {
    const { find, order } = await openAndMenu('pizzaria');
    const pizza = find('Pizzas', 'Pizza Tradicional');
    const grande = pizza.variants.find((v) => v.name === 'Grande');
    const sabores = pizza.optionGroups.find((g) => g.name === 'Sabores tradicionais');
    const borda = pizza.optionGroups.find((g) => g.name === 'Borda recheada');
    const opt = (g, name) => g.options.find((o) => o.name === name);

    const res = await order([{ productId: pizza.id, variantId: grande.id, quantity: 1, options: [
      { groupId: sabores.id, optionId: opt(sabores, 'Calabresa').id },
      { groupId: sabores.id, optionId: opt(sabores, 'Portuguesa').id },
      { groupId: borda.id, optionId: opt(borda, 'Cheddar').id },
    ] }]);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.subtotalCents).toBe(6600 + 1200); // Portuguesa grande + borda cheddar grande
  });

  it('pizzaria: sem escolher o sabor (grupo obrigatório) o pedido é recusado', async () => {
    const { find, order } = await openAndMenu('pizzaria');
    const pizza = find('Pizzas', 'Pizza Tradicional');
    const res = await order([{ productId: pizza.id, variantId: pizza.variants[0].id, quantity: 1, options: [] }]);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('GROUP_MIN');
  });

  it('hamburgueria: ponto da carne obrigatório e adicional repetido até 2x', async () => {
    const { find, order } = await openAndMenu('hamburgueria');
    const burger = find('Hambúrgueres', 'X-Bacon');
    const ponto = burger.optionGroups.find((g) => g.name === 'Ponto da carne');
    const extras = burger.optionGroups.find((g) => g.name === 'Adicionais do lanche');
    const bacon = extras.options.find((o) => o.name === 'Bacon extra');

    const ok = await order([{ productId: burger.id, variantId: burger.variants[0].id, quantity: 2, options: [
      { groupId: ponto.id, optionId: ponto.options.find((o) => o.isDefault).id },
      { groupId: extras.id, optionId: bacon.id, quantity: 2 },
    ] }]);
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.subtotalCents).toBe((3200 + 2 * 500) * 2);

    const semPonto = await order([{ productId: burger.id, variantId: burger.variants[0].id, quantity: 1, options: [] }]);
    expect(semPonto.status).toBe(422);
  });

  it('açaí: preço do copo pelo tamanho, complementos grátis e adicionais pagos', async () => {
    const { find, order } = await openAndMenu('acai');
    const acai = find('Açaí no copo', 'Açaí Tradicional');
    const copo = acai.variants.find((v) => v.name === '500 ml');
    const comp = acai.optionGroups.find((g) => g.name === 'Complementos (até 3)');
    const adic = acai.optionGroups.find((g) => g.name === 'Adicionais');

    const res = await order([{ productId: acai.id, variantId: copo.id, quantity: 1, options: [
      ...comp.options.slice(0, 3).map((o) => ({ groupId: comp.id, optionId: o.id })),
      { groupId: adic.id, optionId: adic.options.find((o) => o.name === 'Creme de ninho').id, quantity: 2 },
    ] }]);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.subtotalCents).toBe(1900 + 2 * 400);

    // 4 complementos passa do limite do grupo (máx. 3)
    const demais = await order([{ productId: acai.id, variantId: copo.id, quantity: 1, options: comp.options.slice(0, 4).map((o) => ({ groupId: comp.id, optionId: o.id })) }]);
    expect(demais.status).toBe(422);
    expect(demais.body.code).toBe('GROUP_MAX');
  });
});
