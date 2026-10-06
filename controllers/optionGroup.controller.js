import db from '../db/knex.js';
import { deleteImage } from '../utils/images.js';
import { HttpError, notFound } from '../utils/errors.js';
import { assertGroupRules, assertVariantsOfStore, loadGroups } from '../services/catalog.service.js';

const GROUP_COLUMNS = {
  name: 'name', minSelect: 'min_select', maxSelect: 'max_select', maxPerOption: 'max_per_option',
  pricingMode: 'pricing_mode', active: 'active',
};
const OPTION_COLUMNS = {
  name: 'name', description: 'description', imageUrl: 'image_url', priceCents: 'price_cents',
  isDefault: 'is_default', position: 'position', active: 'active',
};

const pick = (body, columns) => {
  const data = {};
  for (const [camel, snake] of Object.entries(columns)) if (body[camel] !== undefined) data[snake] = body[camel];
  return data;
};

async function findGroup(storeId, id) {
  const group = await db('option_groups').where({ id, store_id: storeId }).first();
  if (!group) throw notFound('Grupo de opções');
  return group;
}

async function findOption(storeId, id) {
  const option = await db('options as o')
    .join('option_groups as g', 'g.id', 'o.group_id')
    .where('o.id', id)
    .where('g.store_id', storeId)
    .first('o.*');
  if (!option) throw notFound('Opção');
  return option;
}

async function savePrices(trx, optionId, prices) {
  await trx('option_variant_prices').where({ option_id: optionId }).del();
  const rows = Object.entries(prices).map(([variantId, priceCents]) => ({
    option_id: optionId, variant_id: Number(variantId), price_cents: priceCents,
  }));
  if (rows.length) await trx('option_variant_prices').insert(rows);
}

// GET /api/stores/option-groups
export const list = async (req, res) => {
  res.json(await loadGroups(req.user.id));
};

// GET /api/stores/option-groups/:id
export const get = async (req, res) => {
  await findGroup(req.user.id, Number(req.params.id));
  const [group] = await loadGroups(req.user.id, [Number(req.params.id)]);
  res.json(group);
};

// POST /api/stores/option-groups  — grupo + opções numa chamada
export const create = async (req, res) => {
  const storeId = req.user.id;
  const rules = {
    minSelect: req.body.minSelect ?? 0,
    maxSelect: req.body.maxSelect ?? 1,
    maxPerOption: req.body.maxPerOption ?? 1,
    pricingMode: req.body.pricingMode ?? 'ADDITIVE',
  };
  assertGroupRules(rules);

  const options = req.body.options ?? [];
  const names = options.map((o) => o.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) throw new HttpError(422, 'Há opções com o mesmo nome.');

  const id = await db.transaction(async (trx) => {
    const [groupId] = await trx('option_groups').insert({
      ...pick(req.body, GROUP_COLUMNS),
      min_select: rules.minSelect, max_select: rules.maxSelect, max_per_option: rules.maxPerOption,
      pricing_mode: rules.pricingMode, store_id: storeId,
    });
    if (options.length) {
      await trx('options').insert(options.map((o, i) => ({ ...pick(o, OPTION_COLUMNS), position: o.position ?? i, group_id: groupId })));
    }
    return groupId;
  });

  const [group] = await loadGroups(storeId, [id]);
  res.status(201).json(group);
};

// PATCH /api/stores/option-groups/:id
export const update = async (req, res) => {
  const storeId = req.user.id;
  const id = Number(req.params.id);
  const current = await findGroup(storeId, id);

  assertGroupRules({
    minSelect: req.body.minSelect ?? current.min_select,
    maxSelect: req.body.maxSelect ?? current.max_select,
    maxPerOption: req.body.maxPerOption ?? current.max_per_option,
    pricingMode: req.body.pricingMode ?? current.pricing_mode,
  });

  const data = pick(req.body, GROUP_COLUMNS);
  if (Object.keys(data).length) await db('option_groups').where({ id, store_id: storeId }).update(data);

  const [group] = await loadGroups(storeId, [id]);
  res.json(group);
};

// DELETE /api/stores/option-groups/:id
export const remove = async (req, res) => {
  const id = Number(req.params.id);
  await findGroup(req.user.id, id);
  const optionIds = (await db('options').where({ group_id: id }).whereNotNull('image_url').select('id')).map((o) => o.id);
  await db('option_groups').where({ id, store_id: req.user.id }).del();
  for (const optionId of optionIds) await deleteImage('option', optionId);
  res.status(204).end();
};

// ---- opções -----------------------------------------------------------------------------------

// POST /api/stores/option-groups/:id/options
export const addOption = async (req, res) => {
  const storeId = req.user.id;
  const groupId = Number(req.params.id);
  await findGroup(storeId, groupId);

  if (await db('options').where({ group_id: groupId, name: req.body.name }).first('id')) {
    throw new HttpError(409, 'Já existe uma opção com esse nome no grupo.');
  }
  const prices = req.body.prices ?? {};
  await assertVariantsOfStore(storeId, Object.keys(prices).map(Number));

  const id = await db.transaction(async (trx) => {
    const [optionId] = await trx('options').insert({ ...pick(req.body, OPTION_COLUMNS), group_id: groupId });
    await savePrices(trx, optionId, prices);
    return optionId;
  });

  const [group] = await loadGroups(storeId, [groupId]);
  res.status(201).json(group.options.find((o) => o.id === id));
};

// PATCH /api/stores/options/:id   (prices, se enviado, substitui os preços por variação)
export const updateOption = async (req, res) => {
  const storeId = req.user.id;
  const id = Number(req.params.id);
  const option = await findOption(storeId, id);

  if (req.body.prices !== undefined) {
    await assertVariantsOfStore(storeId, Object.keys(req.body.prices).map(Number));
  }

  await db.transaction(async (trx) => {
    const data = pick(req.body, OPTION_COLUMNS);
    if (Object.keys(data).length) await trx('options').where({ id }).update(data);
    if (req.body.prices !== undefined) await savePrices(trx, id, req.body.prices);
  });

  const [group] = await loadGroups(storeId, [option.group_id]);
  res.json(group.options.find((o) => o.id === id));
};

// DELETE /api/stores/options/:id
export const removeOption = async (req, res) => {
  const id = Number(req.params.id);
  await findOption(req.user.id, id);
  await db('options').where({ id }).del();
  await deleteImage('option', id);
  res.status(204).end();
};
