// Fluxo de status do pedido. A lista de status vive no código (e no ENUM do banco).
export const STATUSES = ['RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PICKED_UP', 'REJECTED', 'CANCELED', 'RETURNED'];

const FLOW = {
  RECEIVED: ['PREPARING', 'REJECTED', 'CANCELED'],
  PREPARING: ['READY', 'OUT_FOR_DELIVERY', 'CANCELED'],
  READY: ['PICKED_UP', 'CANCELED'],                 // retirada na loja
  OUT_FOR_DELIVERY: ['DELIVERED', 'RETURNED', 'CANCELED'], // entrega
  DELIVERED: [], PICKED_UP: [], REJECTED: [], CANCELED: [], RETURNED: [],
};

export const REASON_REQUIRED = new Set(['REJECTED', 'CANCELED']);

// Retorna null se a transição é permitida, ou a mensagem do motivo de recusa.
export function checkTransition(order, next) {
  if (!FLOW[order.status].includes(next)) return `Não é possível ir de ${order.status} para ${next}.`;
  if (next === 'READY' && order.fulfillment !== 'PICKUP') return 'READY é só para pedidos de retirada.';
  if (next === 'OUT_FOR_DELIVERY' && order.fulfillment !== 'DELIVERY') return 'OUT_FOR_DELIVERY é só para pedidos de entrega.';
  if (next === 'PICKED_UP' && order.fulfillment !== 'PICKUP') return 'PICKED_UP é só para pedidos de retirada.';
  if ((next === 'DELIVERED' || next === 'RETURNED') && order.fulfillment !== 'DELIVERY') return `${next} é só para pedidos de entrega.`;
  return null;
}
