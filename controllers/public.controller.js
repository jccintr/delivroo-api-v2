import db from '../db/knex.js';
import { buildMenu } from '../services/menu.service.js';
import { createOrder, hydrateOrders } from '../services/order.service.js';
import { notFound } from '../utils/errors.js';

// GET /api/public/stores/:slug/menu
export const menu = async (req, res) => {
  res.json(await buildMenu(req.params.slug));
};

// POST /api/public/stores/:slug/orders
export const placeOrder = async (req, res) => {
  const order = await createOrder(req.params.slug, req.body);
  res.status(201).json(order);
  // fase 2: push (Expo) + WebSocket para o painel da loja
};

// GET /api/public/orders/:publicId — acompanhamento (o id é aleatório; telefone não é devolvido)
export const trackOrder = async (req, res) => {
  const row = await db('orders').where({ public_id: req.params.publicId }).first();
  if (!row) throw notFound('Pedido');

  const [order] = await hydrateOrders(db, [row]);
  const store = await db('stores').where({ id: row.store_id }).first('name', 'slug', 'phone');
  const { customer, ...rest } = order;
  res.json({ ...rest, customer: { name: customer.name }, store });
};
