import db from '../db/knex.js';
import { getTrackingDto } from './order.service.js';
import { hasSubscribers, orderChannel, publish, storeChannel } from './events.js';

// Publicadores de eventos de pedido. Nunca derrubam a requisição: falha no tempo real não pode falhar o pedido.
const safe = (fn) => async (...args) => {
  try { await fn(...args); } catch (err) { console.error('[sse] falha ao publicar evento:', err.message); }
};

/** pedido novo -> painel da loja */
export const notifyOrderCreated = safe(async (order) => {
  // o order.service não devolve o id da loja no DTO; busca pelo id do pedido
  const row = await db('orders').where({ id: order.id }).first('store_id');
  if (row) publish(storeChannel(row.store_id), 'order.created', { order });
});

/** status mudou -> painel da loja (outros aparelhos) e cliente que acompanha o pedido */
export const notifyOrderUpdated = safe(async (storeId, order) => {
  publish(storeChannel(storeId), 'order.updated', { order });
  const channel = orderChannel(order.publicId);
  if (hasSubscribers(channel)) publish(channel, 'order.updated', await getTrackingDto(db, { id: order.id }));
});
