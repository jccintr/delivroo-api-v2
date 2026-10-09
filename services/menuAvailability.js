import db from '../db/knex.js';
import { HttpError } from '../utils/errors.js';
import { getStoreAccess, MENU_UNAVAILABLE } from './storeAccess.js';

// Cardápio e pedidos novos só existem para loja liberada (sem bloqueio do admin e com assinatura em dia).
// A resposta é a MESMA nos dois casos (403 + code): o cliente final só vê "Cardápio indisponível", sem saber o motivo.
export async function assertMenuAvailable(store, now = new Date()) {
  const subscription = await db('subscriptions').where({ store_id: store.id }).first();
  if (!getStoreAccess(store, subscription, now).menuAvailable) {
    throw new HttpError(403, 'Cardápio indisponível.', { code: MENU_UNAVAILABLE });
  }
}
