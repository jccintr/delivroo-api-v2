import db from '../db/knex.js';
import { HttpError, notFound } from '../utils/errors.js';
import { getOrderDto, hydrateOrders } from '../services/order.service.js';
import { REASON_REQUIRED, STATUSES, checkTransition } from '../services/orderStatus.js';

// GET /api/stores/orders?scope=shift|all|range&status=&from=&to=&page=&limit=
//   shift (padrão): pedidos desde que a loja abriu (stores.opened_at); sem turno aberto, últimas 24 h
export const list = async (req, res) => {
  const storeId = req.user.id;
  const { scope = 'shift', status, from, to } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

  if (!['shift', 'all', 'range'].includes(scope)) throw new HttpError(400, 'scope deve ser shift, all ou range.');
  if (status && !STATUSES.includes(status)) throw new HttpError(400, 'status inválido.');

  const q = db('orders').where({ store_id: storeId });

  if (scope === 'shift') {
    const store = await db('stores').where({ id: storeId }).first('opened_at');
    q.where('created_at', '>=', store.opened_at ?? new Date(Date.now() - 24 * 3600 * 1000));
  } else if (scope === 'range') {
    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new HttpError(400, 'Informe from e to (datas ISO) para scope=range.');
    q.where('created_at', '>=', start).where('created_at', '<', end);
  }
  if (status) q.where({ status });

  const { total } = await q.clone().count({ total: 'id' }).first();
  const rows = await q.orderBy([{ column: 'created_at', order: 'desc' }, { column: 'id', order: 'desc' }]).limit(limit).offset((page - 1) * limit);

  res.json({ page, limit, total: Number(total), orders: await hydrateOrders(db, rows) });
};

// GET /api/stores/orders/:id
export const get = async (req, res) => {
  res.json(await getOrderDto(db, { id: Number(req.params.id), store_id: req.user.id }));
};

// POST /api/stores/orders/:id/status  { status, reason? }
export const changeStatus = async (req, res) => {
  const storeId = req.user.id;
  const id = Number(req.params.id);
  const { status, reason } = req.body;

  const order = await db('orders').where({ id, store_id: storeId }).first();
  if (!order) throw notFound('Pedido');

  const problem = checkTransition(order, status);
  if (problem) throw new HttpError(409, problem);
  if (REASON_REQUIRED.has(status) && !reason?.trim()) throw new HttpError(422, 'Informe o motivo.');

  await db.transaction(async (trx) => {
    // "AND status = atual" evita corrida entre dois cliques/aparelhos
    const changed = await trx('orders').where({ id, store_id: storeId, status: order.status }).update({ status });
    if (changed !== 1) throw new HttpError(409, 'O status do pedido mudou. Atualize a tela.');
    await trx('order_status_history').insert({ order_id: id, status, reason: reason?.trim() || null });
  });

  const template = await db('store_message_templates').where({ store_id: storeId, status }).first('body');
  res.json({ order: await getOrderDto(db, { id }), message: template?.body ?? null });
};
