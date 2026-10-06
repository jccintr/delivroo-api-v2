import { describe, it, expect } from 'vitest';
import db from '../db/knex.js';
import { DEMO, seedDemo } from '../db/seed-demo.js';
import { api } from './factories/helpers.js';

describe('seed da loja de exemplo', () => {
  it('cria loja completa e o cardápio público sai consistente', async () => {
    const r = await seedDemo(db);
    expect(r.categories).toBeGreaterThanOrEqual(6);

    const menu = (await api().get(`/api/public/stores/${DEMO.slug}/menu`).expect(200)).body;
    expect(menu.store.isOpen).toBe(true);
    expect(menu.deliveryZones.length).toBeGreaterThanOrEqual(5);
    expect(menu.paymentMethods.map((m) => m.type)).toEqual(expect.arrayContaining(['PIX', 'CASH', 'CARD']));
    expect(menu.businessHours.length).toBeGreaterThan(0);

    for (const cat of menu.categories) expect(cat.products.length, cat.name).toBeGreaterThanOrEqual(4);

    // todo grupo obrigatório tem opções e todo preço por variação cobre todas as variações do produto
    for (const p of menu.categories.flatMap((c) => c.products)) {
      for (const g of p.optionGroups) {
        expect(g.options.length, `${p.name}/${g.name}`).toBeGreaterThanOrEqual(g.minSelect);
        for (const o of g.options) {
          expect(Object.keys(o.prices).length, `${p.name}/${g.name}/${o.name}`).toBe(p.variants.length);
        }
      }
    }
  });

  it('login do painel funciona e um pedido de pizza meio a meio é calculado certo', async () => {
    await seedDemo(db);
    const login = await api().post('/api/stores/login').send({ email: DEMO.email, password: DEMO.password }).expect(200);
    expect(login.body.store.slug).toBe(DEMO.slug);

    const menu = (await api().get(`/api/public/stores/${DEMO.slug}/menu`)).body;
    const pizza = menu.categories.find((c) => c.name === 'Pizzas').products.find((p) => p.name === 'Pizza Tradicional');
    const grande = pizza.variants.find((v) => v.name === 'Grande');
    const sabores = pizza.optionGroups.find((g) => g.name === 'Sabores tradicionais');
    const borda = pizza.optionGroups.find((g) => g.name === 'Borda recheada');
    const calabresa = sabores.options.find((o) => o.name === 'Calabresa');
    const portuguesa = sabores.options.find((o) => o.name === 'Portuguesa');
    const cheddar = borda.options.find((o) => o.name === 'Cheddar');
    const zone = menu.deliveryZones[0];
    const pix = menu.paymentMethods.find((m) => m.type === 'PIX');

    const res = await api().post(`/api/public/stores/${DEMO.slug}/orders`).send({
      fulfillment: 'DELIVERY', name: 'Maria', phone: '35999990000', deliveryZoneId: zone.id, address: 'Rua A, 1', paymentMethodId: pix.id,
      items: [{ productId: pizza.id, variantId: grande.id, quantity: 1, options: [
        { groupId: sabores.id, optionId: calabresa.id }, { groupId: sabores.id, optionId: portuguesa.id }, { groupId: borda.id, optionId: cheddar.id },
      ] }],
    });
    expect(res.status).toBe(201);
    // meio a meio cobra só o mais caro (Portuguesa 66,00) + borda cheddar grande (12,00) + frete
    expect(res.body.subtotalCents).toBe(6600 + 1200);
    expect(res.body.totalCents).toBe(6600 + 1200 + zone.feeCents);
  });
});
