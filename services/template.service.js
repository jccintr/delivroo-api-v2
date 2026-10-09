import { TEMPLATES } from '../templates/index.js';

// Padrões criados junto com toda loja nova (vazia ou com template).
// Mensagens de status não entram aqui: sem personalização vale DEFAULT_MESSAGES (services/messages.js).
export const DEFAULT_PAYMENT_METHODS = [
  ['Pix', 'PIX'],
  ['Dinheiro', 'CASH'],
  ['Cartão de débito', 'CARD'],
  ['Cartão de crédito', 'CARD'],
];

export async function createStoreDefaults(trx, storeId) {
  await trx('payment_methods').insert(
    DEFAULT_PAYMENT_METHODS.map(([name, type], i) => ({ store_id: storeId, name, type, position: i + 1 })),
  );
}

/**
 * Grava um catálogo (grupos de opções + categorias/produtos/variações) numa loja, dentro da transação `trx`.
 * Formato do catálogo: ver templates/helpers.js. Usado pelos templates do cadastro e pelo seed da loja de exemplo.
 * Preço de opção como objeto { NomeDaVariação: centavos } vira preço por variação (pelo NOME da variação).
 */
export async function applyCatalog(trx, storeId, { groups, catalog }) {
  // grupos e opções
  const groupId = {};
  const optionId = {}; // `${groupKey}|${optionName}` -> id
  for (const [key, g] of Object.entries(groups)) {
    const [gid] = await trx('option_groups').insert({
      store_id: storeId, name: g.name, min_select: g.min, max_select: g.max, max_per_option: g.perOption ?? 1, pricing_mode: g.mode,
    });
    groupId[key] = gid;
    let position = 0;
    for (const [name, description, price, isDefault] of g.options) {
      position += 1;
      const [oid] = await trx('options').insert({
        group_id: gid, name, description, position, is_default: !!isDefault,
        price_cents: typeof price === 'number' ? price : 0,
      });
      optionId[`${key}|${name}`] = oid;
    }
  }

  // categorias, produtos, variações e ligação produto <-> grupos
  const linked = {}; // groupKey -> variações dos produtos que usam o grupo
  let productCount = 0;
  let categoryPosition = 0;
  for (const { category, products } of catalog) {
    categoryPosition += 1;
    const [categoryId] = await trx('categories').insert({ store_id: storeId, name: category, position: categoryPosition });

    let productPosition = 0;
    for (const p of products) {
      productPosition += 1;
      productCount += 1;
      const [productId] = await trx('products').insert({
        store_id: storeId, category_id: categoryId, name: p.name, description: p.description ?? null, position: productPosition,
      });

      const variants = [];
      let variantPosition = 0;
      for (const v of p.variants) {
        variantPosition += 1;
        const [variantId] = await trx('product_variants').insert({
          product_id: productId, name: v.name, description: v.description ?? null, price_cents: v.price, position: variantPosition,
        });
        variants.push({ id: variantId, name: v.name });
      }

      let linkPosition = 0;
      for (const key of p.groups) {
        if (groupId[key] === undefined) throw new Error(`Catálogo inválido: o produto "${p.name}" usa o grupo "${key}", que não existe.`);
        linkPosition += 1;
        await trx('product_option_groups').insert({ product_id: productId, group_id: groupId[key], store_id: storeId, position: linkPosition });
        (linked[key] ||= []).push(...variants);
      }
    }
  }

  // preço das opções por variação (ex.: Broto/Grande), pelo nome da variação
  const rows = [];
  for (const [key, g] of Object.entries(groups)) {
    for (const [name, , price] of g.options) {
      if (typeof price !== 'object') continue;
      for (const v of linked[key] ?? []) {
        if (price[v.name] !== undefined) rows.push({ option_id: optionId[`${key}|${name}`], variant_id: v.id, price_cents: price[v.name] });
      }
    }
  }
  if (rows.length) await trx('option_variant_prices').insert(rows);

  return { categories: catalog.length, products: productCount, groups: Object.keys(groups).length };
}

/** aplica um template do cadastro (templates/index.js) numa loja nova */
export function applyStoreTemplate(trx, storeId, key) {
  const template = TEMPLATES[key];
  if (!template) throw new Error(`Template desconhecido: ${key}`);
  return applyCatalog(trx, storeId, template);
}
