// Mensagens de WhatsApp por status do pedido. A loja pode personalizar (store_message_templates);
// sem personalização vale o texto padrão abaixo.
export const MESSAGE_STATUSES = ['PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PICKED_UP', 'REJECTED', 'CANCELED', 'RETURNED'];

export const DEFAULT_MESSAGES = {
  PREPARING: 'Olá! Recebemos o seu pedido e já estamos preparando. 🍕',
  READY: 'Seu pedido está pronto para retirada! Pode vir buscar. 😊',
  OUT_FOR_DELIVERY: 'Seu pedido saiu para entrega! Já já chega aí. 🛵',
  DELIVERED: 'Pedido entregue! Bom apetite e obrigado pela preferência. ❤️',
  PICKED_UP: 'Pedido retirado! Bom apetite e obrigado pela preferência. ❤️',
  REJECTED: 'Sentimos muito, não conseguimos aceitar o seu pedido agora.',
  CANCELED: 'Seu pedido foi cancelado. Qualquer dúvida, é só chamar.',
  RETURNED: 'Não conseguimos entregar o seu pedido. Entre em contato conosco.',
};

/** texto a enviar para o cliente quando o pedido muda para `status` */
export async function messageFor(db, storeId, status) {
  const row = await db('store_message_templates').where({ store_id: storeId, status }).first('body');
  return row?.body ?? DEFAULT_MESSAGES[status] ?? null;
}
