import crypto from 'node:crypto';
import db from '../db/knex.js';
import { HttpError, notFound } from '../utils/errors.js';
import { PricingError, priceItem, priceOrder } from './pricing.js';

// ---- carregar o catálogo necessário para precificar ------------------------------------------

async function loadCatalogForItems(trx, storeId, items) {
  const productIds = [...new Set(items.map((i) => i.productId))];

  const products = await trx('products').where({ store_id: storeId }).whereIn('id', productIds);
  const variants = await trx('product_variants').whereIn('product_id', productIds);
  const links = await trx('product_option_groups as l')
    .join('option_groups as g', 'g.id', 'l.group_id')
    .whereIn('l.product_id', productIds)
    .where('g.store_id', storeId)
    .orderBy(['l.position', 'g.id'])
    .select('l.product_id', 'g.*');

  const groupIds = [...new Set(links.map((l) => l.id))];
  const options = groupIds.length ? await trx('options').whereIn('group_id', groupIds) : [];
  const prices = options.length ? await trx('option_variant_prices').whereIn('option_id', options.map((o) => o.id)) : [];

  const variantPrices = new Map(); // optionId -> { variantId: cents }
  for (const p of prices) {
    const m = variantPrices.get(p.option_id) ?? {};
    m[p.variant_id] = p.price_cents;
    variantPrices.set(p.option_id, m);
  }

  const toGroup = (g) => ({
    id: g.id, name: g.name, minSelect: g.min_select, maxSelect: g.max_select,
    maxPerOption: g.max_per_option, pricingMode: g.pricing_mode, active: !!g.active,
    options: options.filter((o) => o.group_id === g.id).map((o) => ({
      id: o.id, name: o.name, priceCents: o.price_cents, active: !!o.active, variantPrices: variantPrices.get(o.id) ?? {},
    })),
  });

  return { products, variants, links, toGroup };
}

// ---- criar pedido -------------------------------------------------------------------------------

// Segurança extra: se o MySQL abortar a transação por deadlock (erro 1213), tenta de novo.
async function withDeadlockRetry(fn, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err?.code !== 'ER_LOCK_DEADLOCK' || i >= attempts) throw err;
    }
  }
}

export async function createOrder(slug, input) {
  const store = await db('stores').where({ slug, active: true }).first();
  if (!store) throw notFound('Loja');
  if (!store.is_open) throw new HttpError(409, 'A loja está fechada no momento.', { code: 'STORE_CLOSED' });

  const publicId = crypto.randomUUID();

  const orderId = await withDeadlockRetry(() => db.transaction(async (trx) => {
    // 0) número sequencial do pedido na loja. É a PRIMEIRA escrita da transação de propósito: trava a linha
    //    da loja e faz os pedidos da mesma loja entrarem um por vez (sem deadlock nem número repetido).
    await trx.raw('UPDATE stores SET order_seq = LAST_INSERT_ID(order_seq + 1) WHERE id = ?', [store.id]);
    const [[{ n: orderNumber }]] = await trx.raw('SELECT LAST_INSERT_ID() AS n');

    // 1) entrega / retirada
    let zone = null;
    if (input.fulfillment === 'DELIVERY') {
      zone = await trx('delivery_zones').where({ id: input.deliveryZoneId, store_id: store.id, active: true }).first();
      if (!zone) throw new HttpError(422, 'Bairro de entrega inválido.');
    }

    // 2) forma de pagamento
    const payment = await trx('payment_methods').where({ id: input.paymentMethodId, store_id: store.id, active: true }).first();
    if (!payment) throw new HttpError(422, 'Forma de pagamento inválida.');

    // 3) itens: o preço SEMPRE sai do banco
    const catalog = await loadCatalogForItems(trx, store.id, input.items);
    const priced = input.items.map((item) => {
      const product = catalog.products.find((p) => p.id === item.productId);
      if (!product || !product.active) throw new PricingError('PRODUCT_UNAVAILABLE', 'Produto indisponível.');

      const v = catalog.variants.find((x) => x.id === item.variantId && x.product_id === product.id);
      if (!v) throw new PricingError('VARIANT_UNAVAILABLE', 'Variação indisponível.');

      const groups = catalog.links.filter((l) => l.product_id === product.id).map(catalog.toGroup);
      const result = priceItem({
        variant: { id: v.id, name: v.name, priceCents: v.price_cents, active: !!v.active },
        groups,
        selections: item.options ?? [],
        quantity: item.quantity,
      });
      return { item, product, variant: v, result };
    });

    const totals = priceOrder({
      items: priced.map((p) => p.result),
      deliveryFeeCents: zone ? zone.fee_cents : 0,
      discountCents: 0,
    });

    // 4) troco só faz sentido em dinheiro e precisa cobrir o total
    let change = null;
    if (payment.type === 'CASH' && input.cashChangeForCents != null) {
      if (input.cashChangeForCents < totals.totalCents) throw new HttpError(422, 'O valor para troco é menor que o total do pedido.');
      change = input.cashChangeForCents;
    }

    // 5) cliente (por loja + telefone)
    await trx('customers')
      .insert({ store_id: store.id, name: input.name, phone: input.phone })
      .onConflict(['store_id', 'phone'])
      .merge(['name']);
    const customer = await trx('customers').where({ store_id: store.id, phone: input.phone }).first('id');

    // 7) pedido, itens, opções e histórico
    const [id] = await trx('orders').insert({
      public_id: publicId,
      store_id: store.id,
      order_number: orderNumber,
      customer_id: customer.id,
      customer_name: input.name,
      customer_phone: input.phone,
      fulfillment: input.fulfillment,
      status: 'RECEIVED',
      delivery_zone_id: zone?.id ?? null,
      delivery_address: zone ? input.address : null,
      delivery_district: zone?.district ?? null,
      payment_method_id: payment.id,
      payment_method_name: payment.name,
      payment_type: payment.type,
      cash_change_for_cents: change,
      subtotal_cents: totals.subtotalCents,
      delivery_fee_cents: totals.deliveryFeeCents,
      discount_cents: totals.discountCents,
      total_cents: totals.totalCents,
      notes: input.notes ?? null,
    });

    for (const { item, product, variant, result } of priced) {
      const [itemId] = await trx('order_items').insert({
        order_id: id,
        product_id: product.id,
        variant_id: variant.id,
        product_name: product.name,
        variant_name: variant.name,
        unit_price_cents: result.unitPriceCents,
        options_total_cents: result.optionsTotalCents,
        quantity: result.quantity,
        line_total_cents: result.lineTotalCents,
        notes: item.notes ?? null,
      });
      if (result.options.length) {
        await trx('order_item_options').insert(
          result.options.map((o) => ({
            order_item_id: itemId,
            group_id: o.groupId,
            option_id: o.optionId,
            group_name: o.groupName,
            option_name: o.optionName,
            quantity: o.quantity,
            list_price_cents: o.listPriceCents,
            charged_cents: o.chargedCents,
            position: o.position,
          })),
        );
      }
    }

    await trx('order_status_history').insert({ order_id: id, status: 'RECEIVED' });
    return id;
  }));

  return getOrderDto(db, { id: orderId });
}

// ---- leitura de pedidos ---------------------------------------------------------------------------

// Carrega pedidos (já como linhas) com itens, opções e histórico.
export async function hydrateOrders(conn, orders, { withHistory = true } = {}) {
  if (!orders.length) return [];
  const ids = orders.map((o) => o.id);

  const items = await conn('order_items').whereIn('order_id', ids).orderBy('id');
  const options = items.length ? await conn('order_item_options').whereIn('order_item_id', items.map((i) => i.id)).orderBy(['order_item_id', 'position']) : [];
  const history = withHistory ? await conn('order_status_history').whereIn('order_id', ids).orderBy(['created_at', 'id']) : [];

  return orders.map((o) => ({
    id: o.id,
    publicId: o.public_id,
    orderNumber: o.order_number,
    status: o.status,
    fulfillment: o.fulfillment,
    customer: { name: o.customer_name, phone: o.customer_phone },
    delivery: o.fulfillment === 'DELIVERY' ? { address: o.delivery_address, district: o.delivery_district } : null,
    payment: { name: o.payment_method_name, type: o.payment_type, cashChangeForCents: o.cash_change_for_cents },
    subtotalCents: o.subtotal_cents,
    deliveryFeeCents: o.delivery_fee_cents,
    discountCents: o.discount_cents,
    totalCents: o.total_cents,
    notes: o.notes,
    createdAt: o.created_at,
    items: items.filter((i) => i.order_id === o.id).map((i) => ({
      id: i.id,
      productId: i.product_id,
      productName: i.product_name,
      variantName: i.variant_name,
      unitPriceCents: i.unit_price_cents,
      optionsTotalCents: i.options_total_cents,
      quantity: i.quantity,
      lineTotalCents: i.line_total_cents,
      notes: i.notes,
      legacyDescription: i.legacy_description,
      options: options.filter((x) => x.order_item_id === i.id).map((x) => ({
        groupName: x.group_name,
        optionName: x.option_name,
        quantity: x.quantity,
        listPriceCents: x.list_price_cents,
        chargedCents: x.charged_cents,
      })),
    })),
    history: history.filter((h) => h.order_id === o.id).map((h) => ({ status: h.status, reason: h.reason, createdAt: h.created_at })),
  }));
}

export async function getOrderDto(conn, where) {
  const row = await conn('orders').where(where).first();
  if (!row) throw notFound('Pedido');
  const [dto] = await hydrateOrders(conn, [row]);
  return dto;
}
