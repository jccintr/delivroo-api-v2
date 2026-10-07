import db from '../db/knex.js';
import { buildMenu } from '../services/menu.service.js';
import { createOrder, getTrackingDto } from '../services/order.service.js';
import { notifyOrderCreated } from '../services/orderEvents.js';

// GET /api/public/stores/:slug/menu
export const menu = async (req, res) => {
  res.json(await buildMenu(req.params.slug));
};

// POST /api/public/stores/:slug/orders
export const placeOrder = async (req, res) => {
  const order = await createOrder(req.params.slug, req.body);
  res.status(201).json(order);
  notifyOrderCreated(order); // painel da loja recebe na hora (SSE); push (Expo) fica para a fase 2
};

// GET /api/public/orders/:publicId — acompanhamento (o id é aleatório; telefone não é devolvido)
export const trackOrder = async (req, res) => {
  res.json(await getTrackingDto(db, { public_id: req.params.publicId }));
};
