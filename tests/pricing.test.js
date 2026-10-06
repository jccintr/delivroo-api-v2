import { describe, it, expect } from 'vitest';
import { priceItem, priceOrder, PricingError } from '../services/pricing.js';

// mesmos dados do seed.sql
const BROTO = { id: 1, name: 'Broto', priceCents: 0, active: true };
const GRANDE = { id: 2, name: 'Grande', priceCents: 0, active: true };
const pizzaGroups = () => [
  { id: 1, name: 'Sabores', minSelect: 1, maxSelect: 2, maxPerOption: 1, pricingMode: 'HIGHEST', active: true, options: [
    { id: 1, name: 'Calabresa', priceCents: 0, active: true, variantPrices: { 1: 4500, 2: 6500 } },
    { id: 2, name: 'Mussarela', priceCents: 0, active: true, variantPrices: { 1: 4000, 2: 6000 } },
    { id: 3, name: 'Portuguesa', priceCents: 0, active: true, variantPrices: { 1: 5000, 2: 7000 } },
  ] },
  { id: 2, name: 'Borda', minSelect: 0, maxSelect: 1, maxPerOption: 1, pricingMode: 'ADDITIVE', active: true, options: [
    { id: 4, name: 'Catupiry', priceCents: 0, active: true, variantPrices: { 1: 800, 2: 1200 } },
  ] },
  { id: 3, name: 'Adicionais da pizza', minSelect: 0, maxSelect: 5, maxPerOption: 1, pricingMode: 'ADDITIVE', active: true, options: [
    { id: 6, name: 'Bacon', priceCents: 0, active: true, variantPrices: { 1: 500, 2: 800 } },
  ] },
];
const XBACON = { id: 3, name: 'Único', priceCents: 2800, active: true };
const burgerGroups = () => [
  { id: 4, name: 'Ponto da carne', minSelect: 1, maxSelect: 1, maxPerOption: 1, pricingMode: 'ADDITIVE', active: true, options: [
    { id: 9, name: 'Ao ponto', priceCents: 0, active: true },
  ] },
  { id: 5, name: 'Adicionais do lanche', minSelect: 0, maxSelect: 6, maxPerOption: 2, pricingMode: 'ADDITIVE', active: true, options: [
    { id: 11, name: 'Bacon extra', priceCents: 500, active: true },
  ] },
];

const fails = (fn, code) => {
  try { fn(); } catch (e) { expect(e).toBeInstanceOf(PricingError); expect(e.code).toBe(code); return; }
  throw new Error('deveria ter falhado com ' + code);
};

describe('pizza (preço por tamanho, meio a meio cobra o maior)', () => {
  it('1 sabor, broto', () => {
    const r = priceItem({ variant: BROTO, groups: pizzaGroups(), selections: [{ groupId: 1, optionId: 1 }] });
    expect(r.lineTotalCents).toBe(4500);
  });

  it('2 sabores no broto cobram só o mais caro + borda + adicional, x2', () => {
    const r = priceItem({
      variant: BROTO, groups: pizzaGroups(), quantity: 2,
      selections: [{ groupId: 1, optionId: 1 }, { groupId: 1, optionId: 3 }, { groupId: 2, optionId: 4 }, { groupId: 3, optionId: 6 }],
    });
    // (50,00 maior sabor + 8,00 borda + 5,00 bacon) x 2
    expect(r.optionsTotalCents).toBe(6300);
    expect(r.lineTotalCents).toBe(12600);
    const calabresa = r.options.find((o) => o.optionName === 'Calabresa');
    const portuguesa = r.options.find((o) => o.optionName === 'Portuguesa');
    expect(calabresa.chargedCents).toBe(0);      // sabor mais barato sai sem custo
    expect(portuguesa.chargedCents).toBe(5000);
    expect(calabresa.listPriceCents).toBe(4500); // preço de tabela fica registrado
  });

  it('o mesmo pedido no grande usa os preços do grande', () => {
    const r = priceItem({
      variant: GRANDE, groups: pizzaGroups(),
      selections: [{ groupId: 1, optionId: 2 }, { groupId: 1, optionId: 3 }, { groupId: 2, optionId: 4 }],
    });
    expect(r.lineTotalCents).toBe(7000 + 1200);
  });

  it('exige ao menos 1 sabor e no máximo 2', () => {
    fails(() => priceItem({ variant: BROTO, groups: pizzaGroups(), selections: [{ groupId: 2, optionId: 4 }] }), 'GROUP_MIN');
    fails(() => priceItem({ variant: BROTO, groups: pizzaGroups(), selections: [
      { groupId: 1, optionId: 1 }, { groupId: 1, optionId: 2 }, { groupId: 1, optionId: 3 }] }), 'GROUP_MAX');
  });

  it('o mesmo sabor duas vezes não vale como 2 sabores', () => {
    fails(() => priceItem({ variant: BROTO, groups: pizzaGroups(), selections: [{ groupId: 1, optionId: 1 }, { groupId: 1, optionId: 1 }] }), 'OPTION_MAX');
  });
});

describe('hambúrguer (grupo obrigatório + adicional repetível)', () => {
  it('soma base + 2x bacon extra', () => {
    const r = priceItem({
      variant: XBACON, groups: burgerGroups(),
      selections: [{ groupId: 4, optionId: 9 }, { groupId: 5, optionId: 11, quantity: 2 }],
    });
    expect(r.lineTotalCents).toBe(2800 + 1000);
  });
  it('sem o ponto da carne não passa', () => {
    fails(() => priceItem({ variant: XBACON, groups: burgerGroups(), selections: [] }), 'GROUP_MIN');
  });
  it('3x a mesma opção passa do limite', () => {
    fails(() => priceItem({ variant: XBACON, groups: burgerGroups(), selections: [{ groupId: 4, optionId: 9 }, { groupId: 5, optionId: 11, quantity: 3 }] }), 'OPTION_MAX');
  });
});

describe('segurança', () => {
  it('rejeita opção de grupo que não pertence ao produto', () => {
    fails(() => priceItem({ variant: XBACON, groups: burgerGroups(), selections: [{ groupId: 1, optionId: 1 }] }), 'GROUP_NOT_ALLOWED');
  });
  it('rejeita opção desativada ("acabou hoje")', () => {
    const g = pizzaGroups(); g[0].options[0].active = false;
    fails(() => priceItem({ variant: BROTO, groups: g, selections: [{ groupId: 1, optionId: 1 }] }), 'OPTION_UNAVAILABLE');
  });
  it('rejeita variação inativa e quantidade inválida', () => {
    fails(() => priceItem({ variant: { ...BROTO, active: false }, groups: [], selections: [] }), 'VARIANT_UNAVAILABLE');
    fails(() => priceItem({ variant: XBACON, groups: burgerGroups(), selections: [{ groupId: 4, optionId: 9 }], quantity: 0 }), 'INVALID_QUANTITY');
  });
});

describe('pedido', () => {
  it('subtotal + entrega - desconto', () => {
    const a = priceItem({ variant: XBACON, groups: burgerGroups(), selections: [{ groupId: 4, optionId: 9 }] });
    const t = priceOrder({ items: [a, a], deliveryFeeCents: 500, discountCents: 300 });
    expect(t).toEqual({ subtotalCents: 5600, deliveryFeeCents: 500, discountCents: 300, totalCents: 5800 });
  });
  it('desconto maior que o pedido é recusado', () => {
    const a = priceItem({ variant: XBACON, groups: burgerGroups(), selections: [{ groupId: 4, optionId: 9 }] });
    fails(() => priceOrder({ items: [a], discountCents: 999999 }), 'INVALID_DISCOUNT');
  });
});
