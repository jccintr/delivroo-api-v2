import db from '../db/knex.js';
import { HttpError, notFound } from '../utils/errors.js';
import { variantDto } from '../utils/dto.js';
import { loadProduct, loadProducts } from '../services/catalog.service.js';
import { deleteImage } from '../utils/images.js';

const PRODUCT_COLUMNS = {
  categoryId: 'category_id', name: 'name', description: 'description',
  imageUrl: 'image_url', position: 'position', active: 'active',
};
const VARIANT_COLUMNS = { name: 'name', description: 'description', priceCents: 'price_cents', position: 'position', active: 'active' };

const pick = (body, columns) => {
  const data = {};
  for (const [camel, snake] of Object.entries(columns)) if (body[camel] !== undefined) data[snake] = body[camel];
  return data;
};

async function assertCategory(storeId, categoryId) {
  if (!(await db('categories').where({ id: categoryId, store_id: storeId }).first('id'))) {
    throw new HttpError(422, 'Categoria inválida.');
  }
}

// GET /api/stores/products
export const list = async (req, res) => {
  res.json(await loadProducts(req.user.id));
};

// GET /api/stores/products/:id
export const get = async (req, res) => {
  await loadProduct(req.user.id, Number(req.params.id));
  const [product] = await loadProducts(req.user.id, [Number(req.params.id)]);
  res.json(product);
};

// POST /api/stores/products  — produto + variações numa chamada
export const create = async (req, res) => {
  const storeId = req.user.id;
  await assertCategory(storeId, req.body.categoryId);

  const names = req.body.variants.map((v) => v.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) throw new HttpError(422, 'Há variações com o mesmo nome.');

  const id = await db.transaction(async (trx) => {
    const [productId] = await trx('products').insert({ ...pick(req.body, PRODUCT_COLUMNS), store_id: storeId });
    await trx('product_variants').insert(
      req.body.variants.map((v, i) => ({ ...pick(v, VARIANT_COLUMNS), position: v.position ?? i, product_id: productId })),
    );
    return productId;
  });

  const [product] = await loadProducts(storeId, [id]);
  res.status(201).json(product);
};

// PATCH /api/stores/products/:id
export const update = async (req, res) => {
  const storeId = req.user.id;
  const id = Number(req.params.id);
  await loadProduct(storeId, id);

  if (req.body.categoryId !== undefined) await assertCategory(storeId, req.body.categoryId);

  const data = pick(req.body, PRODUCT_COLUMNS);
  if (Object.keys(data).length) await db('products').where({ id, store_id: storeId }).update(data);

  const [product] = await loadProducts(storeId, [id]);
  res.json(product);
};

// DELETE /api/stores/products/:id  (pedidos antigos ficam, pois guardam cópia dos nomes e preços)
export const remove = async (req, res) => {
  const id = Number(req.params.id);
  await loadProduct(req.user.id, id);
  await db('products').where({ id, store_id: req.user.id }).del();
  await deleteImage('product', id);
  res.status(204).end();
};

// ---- variações ----------------------------------------------------------------------------

async function loadVariant(storeId, productId, variantId) {
  await loadProduct(storeId, productId);
  const variant = await db('product_variants').where({ id: variantId, product_id: productId }).first();
  if (!variant) throw notFound('Variação');
  return variant;
}

// POST /api/stores/products/:id/variants
export const addVariant = async (req, res) => {
  const productId = Number(req.params.id);
  await loadProduct(req.user.id, productId);

  const dup = await db('product_variants').where({ product_id: productId, name: req.body.name }).first('id');
  if (dup) throw new HttpError(409, 'Já existe uma variação com esse nome.');

  const [id] = await db('product_variants').insert({ ...pick(req.body, VARIANT_COLUMNS), product_id: productId });
  res.status(201).json(variantDto(await db('product_variants').where({ id }).first()));
};

// PATCH /api/stores/products/:id/variants/:variantId
export const updateVariant = async (req, res) => {
  const productId = Number(req.params.id);
  const variantId = Number(req.params.variantId);
  await loadVariant(req.user.id, productId, variantId);

  const data = pick(req.body, VARIANT_COLUMNS);
  if (Object.keys(data).length) await db('product_variants').where({ id: variantId }).update(data);
  res.json(variantDto(await db('product_variants').where({ id: variantId }).first()));
};

// DELETE /api/stores/products/:id/variants/:variantId  (o produto precisa manter ao menos uma)
export const removeVariant = async (req, res) => {
  const productId = Number(req.params.id);
  const variantId = Number(req.params.variantId);
  await loadVariant(req.user.id, productId, variantId);

  const { n } = await db('product_variants').where({ product_id: productId }).count({ n: 'id' }).first();
  if (Number(n) <= 1) throw new HttpError(422, 'O produto precisa ter pelo menos uma variação.');

  await db('product_variants').where({ id: variantId }).del();
  res.status(204).end();
};

// ---- grupos de opções do produto -----------------------------------------------------------

// PUT /api/stores/products/:id/option-groups  { groupIds: [2, 1] } — substitui, a ordem da lista vira a ordem na tela
export const setOptionGroups = async (req, res) => {
  const storeId = req.user.id;
  const productId = Number(req.params.id);
  await loadProduct(storeId, productId);

  const groupIds = req.body.groupIds;
  if (new Set(groupIds).size !== groupIds.length) throw new HttpError(422, 'groupIds tem ids repetidos.');

  if (groupIds.length) {
    const { n } = await db('option_groups').where({ store_id: storeId }).whereIn('id', groupIds).count({ n: 'id' }).first();
    if (Number(n) !== groupIds.length) throw new HttpError(422, 'Grupo de opções inválido.');
  }

  await db.transaction(async (trx) => {
    await trx('product_option_groups').where({ product_id: productId }).del();
    if (groupIds.length) {
      await trx('product_option_groups').insert(
        groupIds.map((groupId, position) => ({ product_id: productId, group_id: groupId, store_id: storeId, position })),
      );
    }
  });

  const [product] = await loadProducts(storeId, [productId]);
  res.json(product);
};
