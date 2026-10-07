import db from '../db/knex.js';
import { DEFAULT_MESSAGES, MESSAGE_STATUSES } from '../services/messages.js';

async function listAll(storeId) {
  const rows = await db('store_message_templates').where({ store_id: storeId });
  const custom = new Map(rows.map((r) => [r.status, r.body]));
  return MESSAGE_STATUSES.map((status) => ({
    status,
    body: custom.get(status) ?? DEFAULT_MESSAGES[status],
    defaultBody: DEFAULT_MESSAGES[status],
    isCustom: custom.has(status),
  }));
}

// GET /api/stores/message-templates — os 8 status, com o texto em uso (personalizado ou padrão)
export const list = async (req, res) => {
  res.json(await listAll(req.user.id));
};

// PUT /api/stores/message-templates/:status  { body }
export const save = async (req, res) => {
  const { status } = req.params;
  const exists = await db('store_message_templates').where({ store_id: req.user.id, status }).first('id');
  if (exists) await db('store_message_templates').where({ id: exists.id }).update({ body: req.body.body.trim() });
  else await db('store_message_templates').insert({ store_id: req.user.id, status, body: req.body.body.trim() });
  res.json((await listAll(req.user.id)).find((m) => m.status === status));
};

// DELETE /api/stores/message-templates/:status — volta ao texto padrão
export const reset = async (req, res) => {
  await db('store_message_templates').where({ store_id: req.user.id, status: req.params.status }).del();
  res.status(204).end();
};
