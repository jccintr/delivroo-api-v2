import db from '../db/knex.js';
import { HttpError, notFound } from '../utils/errors.js';
import { groupDto, optionDto, variantDto } from '../utils/dto.js';

// Grupos da loja com opções e preços por variação. ids = filtrar por grupos específicos.
export async function loadGroups(storeId, ids = null) {
  const q = db('option_groups').where({ store_id: storeId }).orderBy('id');
  if (ids) q.whereIn('id', ids);
  const groups = await q;
  if (!groups.length) return [];

  const options = await db('options').whereIn('group_id', groups.map((g) => g.id)).orderBy(['position', 'id']);
  const prices = options.length
    ? await db('option_variant_prices').whereIn('option_id', options.map((o) => o.id))
    : [];

  const pricesByOption = new Map();
  for (const p of prices) {
    const map = pricesByOption.get(p.option_id) ?? {};
    map[p.variant_id] = p.price_cents;
    pricesByOption.set(p.option_id, map);
  }

  return groups.map((g) =>
    groupDto(g, options.filter((o) => o.group_id === g.id).map((o) => optionDto(o, pricesByOption.get(o.id) ?? {}))),
  );
}

// As variações informadas precisam ser de produtos desta loja.
export async function assertVariantsOfStore(storeId, variantIds, trx = db) {
  if (!variantIds.length) return;
  const found = await trx('product_variants as v')
    .join('products as p', 'p.id', 'v.product_id')
    .where('p.store_id', storeId)
    .whereIn('v.id', variantIds)
    .count({ n: 'v.id' })
    .first();
  if (Number(found.n) !== new Set(variantIds).size) throw new HttpError(422, 'Variação inválida em prices.');
}

export function assertGroupRules({ minSelect, maxSelect, maxPerOption, pricingMode }) {
  if (maxSelect < 1) throw new HttpError(422, 'maxSelect deve ser pelo menos 1.');
  if (maxSelect < minSelect) throw new HttpError(422, 'maxSelect não pode ser menor que minSelect.');
  if (maxPerOption < 1) throw new HttpError(422, 'maxPerOption deve ser pelo menos 1.');
  if (pricingMode === 'HIGHEST' && maxPerOption !== 1) {
    throw new HttpError(422, 'Em grupos HIGHEST a mesma opção só pode ser escolhida 1 vez (maxPerOption = 1).');
  }
}

export async function loadProduct(storeId, id) {
  const product = await db('products').where({ id, store_id: storeId }).first();
  if (!product) throw notFound('Produto');
  return product;
}

// Produtos da loja já com variações e ids dos grupos (na ordem). ids = só esses produtos.
export async function loadProducts(storeId, ids = null) {
  const q = db('products').where({ store_id: storeId }).orderBy(['position', 'id']);
  if (ids) q.whereIn('id', ids);
  const products = await q;
  if (!products.length) return [];

  const pids = products.map((p) => p.id);
  const variants = await db('product_variants').whereIn('product_id', pids).orderBy(['position', 'id']);
  const links = await db('product_option_groups').whereIn('product_id', pids).orderBy(['position', 'group_id']);

  return products.map((p) => ({
    id: p.id,
    categoryId: p.category_id,
    name: p.name,
    description: p.description,
    imageUrl: p.image_url,
    position: p.position,
    active: !!p.active,
    variants: variants.filter((v) => v.product_id === p.id).map(variantDto),
    optionGroupIds: links.filter((l) => l.product_id === p.id).map((l) => l.group_id),
  }));
}
