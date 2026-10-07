import db from '../db/knex.js';
import { notFound } from './errors.js';

// Constrói list/create/update/remove para tabelas simples de uma loja (tudo filtrado por store_id).
// columns: { campoCamel: 'coluna_snake' }
export function makeCrud({ table, label, columns, toDto, orderBy = ['id'] }) {
  const pick = (body) => {
    const data = {};
    for (const [camel, snake] of Object.entries(columns)) {
      if (body[camel] !== undefined) data[snake] = body[camel];
    }
    return data;
  };

  const find = async (storeId, id) => {
    const row = await db(table).where({ id, store_id: storeId }).first();
    if (!row) throw notFound(label);
    return row;
  };

  return {
    list: async (req, res) => {
      const rows = await db(table).where({ store_id: req.user.id }).orderBy(orderBy);
      res.json(rows.map(toDto));
    },
    get: async (req, res) => {
      res.json(toDto(await find(req.user.id, Number(req.params.id))));
    },
    create: async (req, res) => {
      const [id] = await db(table).insert({ ...pick(req.body), store_id: req.user.id });
      res.status(201).json(toDto(await find(req.user.id, id)));
    },
    update: async (req, res) => {
      const id = Number(req.params.id);
      await find(req.user.id, id);
      const data = pick(req.body);
      if (Object.keys(data).length) await db(table).where({ id, store_id: req.user.id }).update(data);
      res.json(toDto(await find(req.user.id, id)));
    },
    remove: async (req, res) => {
      const id = Number(req.params.id);
      await find(req.user.id, id);
      await db(table).where({ id, store_id: req.user.id }).del();
      res.status(204).end();
    },
  };
}
