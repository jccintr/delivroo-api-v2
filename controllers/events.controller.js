import jsonwebtoken from 'jsonwebtoken';
import db from '../db/knex.js';
import { HttpError, notFound } from '../utils/errors.js';
import { getTrackingDto } from '../services/order.service.js';
import { orderChannel, storeChannel, subscribe } from '../services/events.js';

// O EventSource do navegador não envia o header Authorization. Por isso a loja troca o JWT por um
// token de curta duração (só serve para abrir o fluxo) e o passa na query string.
const SSE_TTL_SECONDS = 120;
const sseSecret = () => `${process.env.JWT_SECRET_STORE}:sse`; // segredo derivado: este token NÃO vale como login

// POST /api/stores/events-token  (autenticado)
export const storeToken = (req, res) => {
  const token = jsonwebtoken.sign({ storeId: req.user.id, purpose: 'sse' }, sseSecret(), { expiresIn: SSE_TTL_SECONDS });
  res.json({ token, expiresIn: SSE_TTL_SECONDS });
};

// GET /api/stores/events?token=...  — fluxo da loja
export const storeStream = async (req, res) => {
  let decoded;
  try {
    decoded = jsonwebtoken.verify(String(req.query.token ?? ''), sseSecret());
  } catch {
    throw new HttpError(401, 'Não autorizado');
  }
  if (decoded.purpose !== 'sse') throw new HttpError(401, 'Não autorizado');
  const store = await db('stores').where({ id: decoded.storeId }).first('id', 'active');
  if (!store || !store.active) throw new HttpError(401, 'Não autorizado');

  if (!subscribe(storeChannel(store.id), req, res)) throw new HttpError(429, 'Muitas conexões abertas para esta loja.');
};

// GET /api/public/orders/:publicId/events  — fluxo do cliente (o publicId aleatório é o "segredo")
export const orderStream = async (req, res) => {
  const where = { public_id: req.params.publicId };
  if (!(await db('orders').where(where).first('id'))) throw notFound('Pedido');
  // já manda o estado atual: quem reconecta não perde atualizações que aconteceram enquanto estava fora
  const snapshot = await getTrackingDto(db, where);
  if (!subscribe(orderChannel(req.params.publicId), req, res, [{ event: 'order.updated', data: snapshot }])) {
    throw new HttpError(429, 'Muitas conexões abertas para este pedido.');
  }
};
