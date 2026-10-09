import { describe, it, expect } from 'vitest';
import { api, auth, registerStore, seedPizzaria } from './factories/helpers.js';

const mkCategory = async (token, name = 'Lanches') =>
  (await api().post('/api/stores/categories').set(auth(token)).send({ name })).body;

describe('Categorias', () => {
  it('CRUD e ordenação por posição', async () => {
    const { token } = await registerStore();
    await api().post('/api/stores/categories').set(auth(token)).send({ name: 'Bebidas', position: 2 }).expect(201);
    const a = await api().post('/api/stores/categories').set(auth(token)).send({ name: 'Pizzas', position: 1 });
    expect(a.status).toBe(201);
    const list = await api().get('/api/stores/categories').set(auth(token));
    expect(list.body.map((c) => c.name)).toEqual(['Pizzas', 'Bebidas']);

    const patched = await api().patch(`/api/stores/categories/${a.body.id}`).set(auth(token)).send({ name: 'Pizzas Salgadas' });
    expect(patched.body.name).toBe('Pizzas Salgadas');
    expect((await api().post('/api/stores/categories').set(auth(token)).send({ name: '' })).status).toBe(400);
  });

  it('não apaga categoria que ainda tem produtos (409)', async () => {
    const { token } = await registerStore();
    const cat = await mkCategory(token);
    await api().post('/api/stores/products').set(auth(token)).send({ categoryId: cat.id, name: 'X', variants: [{ name: 'Único', priceCents: 1000 }] }).expect(201);
    expect((await api().delete(`/api/stores/categories/${cat.id}`).set(auth(token))).status).toBe(409);
  });
});

describe('Produtos e variações', () => {
  it('cria produto com variações numa chamada', async () => {
    const { token } = await registerStore();
    const cat = await mkCategory(token);
    const res = await api().post('/api/stores/products').set(auth(token)).send({
      categoryId: cat.id, name: 'Refrigerante', variants: [{ name: 'Lata', priceCents: 600 }, { name: '2 L', priceCents: 1400 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.variants.map((v) => [v.name, v.priceCents])).toEqual([['Lata', 600], ['2 L', 1400]]);
    expect(res.body.optionGroupIds).toEqual([]);
  });

  it('exige ao menos uma variação, preço inteiro em centavos e categoria da própria loja', async () => {
    const a = await registerStore();
    const b = await registerStore();
    const catA = await mkCategory(a.token);
    const base = { categoryId: catA.id, name: 'X' };

    expect((await api().post('/api/stores/products').set(auth(a.token)).send({ ...base, variants: [] })).status).toBe(400);
    expect((await api().post('/api/stores/products').set(auth(a.token)).send({ ...base, variants: [{ name: 'Único', priceCents: 10.5 }] })).status).toBe(400);
    expect((await api().post('/api/stores/products').set(auth(a.token)).send({ ...base, variants: [{ name: 'Único', priceCents: -1 }] })).status).toBe(400);
    // categoria de outra loja
    expect((await api().post('/api/stores/products').set(auth(b.token)).send({ ...base, variants: [{ name: 'Único', priceCents: 100 }] })).status).toBe(422);
    // nomes de variação repetidos
    expect((await api().post('/api/stores/products').set(auth(a.token)).send({ ...base, variants: [{ name: 'Único', priceCents: 1 }, { name: 'único', priceCents: 2 }] })).status).toBe(422);
  });

  it('adiciona, altera e remove variação, mas mantém ao menos uma', async () => {
    const { token } = await registerStore();
    const cat = await mkCategory(token);
    const p = (await api().post('/api/stores/products').set(auth(token)).send({ categoryId: cat.id, name: 'Suco', variants: [{ name: '300 ml', priceCents: 700 }] })).body;

    const added = await api().post(`/api/stores/products/${p.id}/variants`).set(auth(token)).send({ name: '500 ml', priceCents: 1000 });
    expect(added.status).toBe(201);
    expect((await api().post(`/api/stores/products/${p.id}/variants`).set(auth(token)).send({ name: '500 ml', priceCents: 1 })).status).toBe(409);

    const upd = await api().patch(`/api/stores/products/${p.id}/variants/${added.body.id}`).set(auth(token)).send({ priceCents: 1100 });
    expect(upd.body.priceCents).toBe(1100);

    expect((await api().delete(`/api/stores/products/${p.id}/variants/${added.body.id}`).set(auth(token))).status).toBe(204);
    expect((await api().delete(`/api/stores/products/${p.id}/variants/${p.variants[0].id}`).set(auth(token))).status).toBe(422);
  });

  it('uma loja não enxerga nem mexe nos produtos de outra', async () => {
    const a = await registerStore();
    const b = await registerStore();
    const cat = await mkCategory(a.token);
    const p = (await api().post('/api/stores/products').set(auth(a.token)).send({ categoryId: cat.id, name: 'X', variants: [{ name: 'Único', priceCents: 1000 }] })).body;

    expect((await api().get('/api/stores/products').set(auth(b.token))).body).toEqual([]);
    expect((await api().get(`/api/stores/products/${p.id}`).set(auth(b.token))).status).toBe(404);
    expect((await api().patch(`/api/stores/products/${p.id}`).set(auth(b.token)).send({ name: 'Hack' })).status).toBe(404);
    expect((await api().delete(`/api/stores/products/${p.id}`).set(auth(b.token))).status).toBe(404);
    expect((await api().post(`/api/stores/products/${p.id}/variants`).set(auth(b.token)).send({ name: 'Y', priceCents: 1 })).status).toBe(404);
  });
});

describe('Grupos de opções', () => {
  it('cria grupo com opções e aplica os padrões', async () => {
    const { token } = await registerStore();
    const res = await api().post('/api/stores/option-groups').set(auth(token)).send({ name: 'Molhos', options: [{ name: 'Barbecue' }, { name: 'Maionese', priceCents: 200 }] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ minSelect: 0, maxSelect: 1, maxPerOption: 1, pricingMode: 'ADDITIVE' });
    expect(res.body.options.map((o) => [o.name, o.priceCents])).toEqual([['Barbecue', 0], ['Maionese', 200]]);
  });

  it('recusa regras incoerentes (422)', async () => {
    const { token } = await registerStore();
    const post = (body) => api().post('/api/stores/option-groups').set(auth(token)).send(body);
    expect((await post({ name: 'A', minSelect: 3, maxSelect: 1 })).status).toBe(422);
    expect((await post({ name: 'B', pricingMode: 'HIGHEST', maxSelect: 2, maxPerOption: 2 })).status).toBe(422);
    expect((await post({ name: 'C', maxSelect: 0 })).status).toBe(400);
    expect((await post({ name: 'D', pricingMode: 'MEDIA' })).status).toBe(400);
    expect((await post({ name: 'E', options: [{ name: 'x' }, { name: 'X' }] })).status).toBe(422);
  });

  it('PATCH revalida as regras com os valores atuais', async () => {
    const { token } = await registerStore();
    const g = (await api().post('/api/stores/option-groups').set(auth(token)).send({ name: 'Adic', maxSelect: 3, maxPerOption: 2 })).body;
    // trocar para HIGHEST sem baixar maxPerOption é incoerente
    expect((await api().patch(`/api/stores/option-groups/${g.id}`).set(auth(token)).send({ pricingMode: 'HIGHEST' })).status).toBe(422);
    const ok = await api().patch(`/api/stores/option-groups/${g.id}`).set(auth(token)).send({ pricingMode: 'HIGHEST', maxPerOption: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body.pricingMode).toBe('HIGHEST');
  });

  it('preço por variação: grava, substitui e recusa variação de outra loja', async () => {
    const a = await registerStore();
    const b = await registerStore();
    const s = await seedPizzaria(a.token);
    const catB = await mkCategory(b.token);
    const prodB = (await api().post('/api/stores/products').set(auth(b.token)).send({ categoryId: catB.id, name: 'P', variants: [{ name: 'Único', priceCents: 1 }] })).body;

    const calabresa = s.groups.sabores.options.find((o) => o.name === 'Calabresa');
    const set = await api().patch(`/api/stores/options/${calabresa.id}`).set(auth(a.token)).send({ prices: { [s.broto.id]: 4700 } });
    expect(set.status).toBe(200);
    expect(set.body.prices).toEqual({ [s.broto.id]: 4700 }); // substituiu (Grande saiu)

    const foreign = await api().patch(`/api/stores/options/${calabresa.id}`).set(auth(a.token)).send({ prices: { [prodB.variants[0].id]: 100 } });
    expect(foreign.status).toBe(422);
    expect((await api().patch(`/api/stores/options/${calabresa.id}`).set(auth(a.token)).send({ prices: { abc: 100 } })).status).toBe(400);
    expect((await api().patch(`/api/stores/options/${calabresa.id}`).set(auth(a.token)).send({ prices: { [s.broto.id]: -5 } })).status).toBe(400);
  });

  it('só liga ao produto grupos da própria loja', async () => {
    const a = await registerStore();
    const b = await registerStore();
    const cat = await mkCategory(a.token);
    const p = (await api().post('/api/stores/products').set(auth(a.token)).send({ categoryId: cat.id, name: 'X', variants: [{ name: 'Único', priceCents: 1 }] })).body;
    const gA = (await api().post('/api/stores/option-groups').set(auth(a.token)).send({ name: 'GA' })).body;
    const gB = (await api().post('/api/stores/option-groups').set(auth(b.token)).send({ name: 'GB' })).body;

    expect((await api().put(`/api/stores/products/${p.id}/option-groups`).set(auth(a.token)).send({ groupIds: [gB.id] })).status).toBe(422);
    const ok = await api().put(`/api/stores/products/${p.id}/option-groups`).set(auth(a.token)).send({ groupIds: [gA.id] });
    expect(ok.body.optionGroupIds).toEqual([gA.id]);
    expect((await api().put(`/api/stores/products/${p.id}/option-groups`).set(auth(a.token)).send({ groupIds: [gA.id, gA.id] })).status).toBe(422);
    // a ordem enviada vira a ordem de exibição
    const g2 = (await api().post('/api/stores/option-groups').set(auth(a.token)).send({ name: 'G2' })).body;
    const ordered = await api().put(`/api/stores/products/${p.id}/option-groups`).set(auth(a.token)).send({ groupIds: [g2.id, gA.id] });
    expect(ordered.body.optionGroupIds).toEqual([g2.id, gA.id]);
    // outra loja não mexe
    expect((await api().get(`/api/stores/option-groups/${gA.id}`).set(auth(b.token))).status).toBe(404);
    expect((await api().delete(`/api/stores/options/${gA.id}`).set(auth(b.token))).status).toBe(404);
  });
});

describe('Cardápio público', () => {
  it('devolve a pizza com preços resolvidos por tamanho e esconde o que está inativo', async () => {
    const { token, store } = await registerStore();
    const s = await seedPizzaria(token);

    // desativa a Mussarela e o refrigerante de 2 L
    const mussarela = s.groups.sabores.options.find((o) => o.name === 'Mussarela');
    await api().patch(`/api/stores/options/${mussarela.id}`).set(auth(token)).send({ active: false }).expect(200);
    await api().patch(`/api/stores/products/${s.soda.id}/variants/${s.soda.variants[1].id}`).set(auth(token)).send({ active: false }).expect(200);

    const res = await api().get(`/api/public/stores/${store.slug}/menu`);
    expect(res.status).toBe(200);
    expect(res.body.store.isOpen).toBe(true);
    expect(res.body.deliveryZones).toEqual([{ id: s.zoneCentro.id, district: 'Centro', feeCents: 500 }]);
    expect(res.body.paymentMethods.map((m) => m.name)).toEqual(['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito']); // padrões da loja nova, na ordem de posição
    expect(res.body.categories.map((c) => c.name)).toEqual(['Pizzas', 'Hambúrgueres', 'Bebidas']);

    const pizza = res.body.categories[0].products[0];
    expect(pizza.variants.map((v) => v.name)).toEqual(['Broto', 'Grande']);
    const sabores = pizza.optionGroups.find((g) => g.name === 'Sabores');
    expect(sabores).toMatchObject({ minSelect: 1, maxSelect: 2, pricingMode: 'HIGHEST' });
    expect(sabores.options.map((o) => o.name)).toEqual(['Calabresa', 'Portuguesa']); // sem Mussarela
    expect(sabores.options[0].prices).toEqual({ [s.broto.id]: 4500, [s.grande.id]: 6500 });

    const burger = res.body.categories[1].products[0];
    const extras = burger.optionGroups.find((g) => g.name === 'Adicionais do lanche');
    // sem preço por variação: o preço padrão vale para todas as variações
    expect(extras.options[0].prices).toEqual({ [burger.variants[0].id]: 500 });

    const soda = res.body.categories[2].products[0];
    expect(soda.variants.map((v) => v.name)).toEqual(['Lata 350 ml']);
  });

  it('não mostra produto inativo, categoria vazia nem dados sensíveis; loja inexistente dá 404', async () => {
    const { token, store } = await registerStore();
    const s = await seedPizzaria(token);
    await api().patch(`/api/stores/products/${s.soda.id}`).set(auth(token)).send({ active: false }).expect(200);

    const res = await api().get(`/api/public/stores/${store.slug}/menu`);
    expect(res.body.categories.map((c) => c.name)).toEqual(['Pizzas', 'Hambúrgueres']);
    expect(JSON.stringify(res.body)).not.toMatch(/password|email/i);
    expect((await api().get('/api/public/stores/nao-existe/menu')).status).toBe(404);
  });
});
