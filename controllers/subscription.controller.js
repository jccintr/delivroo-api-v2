import db from '../db/knex.js';
import { storeDto } from '../utils/dto.js';
import { planDto, loadSubscriptionView, setPlan, reportPayment } from '../services/billing.js';
import { accessDto } from '../services/storeAccess.js';

// Chave Pix do Delivroo que a loja usa para pagar (cobrança manual). Vem do ambiente; sem ela a tela avisa.
export const billingPix = () => (process.env.BILLING_PIX_KEY
  ? {
    key: process.env.BILLING_PIX_KEY,
    keyType: process.env.BILLING_PIX_KEY_TYPE || null,
    beneficiary: process.env.BILLING_PIX_BENEFICIARY || null,
    instructions: process.env.BILLING_PIX_INSTRUCTIONS || null,
  }
  : null);

const respond = async (res, storeId) => {
  const [view, plans] = await Promise.all([
    loadSubscriptionView(storeId),
    db('plans').where({ active: true }).orderBy(['position', 'id']),
  ]);
  res.json({ ...view, access: accessDto(view.access), plans: plans.map((p) => planDto(p)), pix: billingPix() });
};

// GET /api/stores/subscription — situação, fatura em aberto, histórico, planos disponíveis e chave Pix
export const getSubscription = (req, res) => respond(res, req.user.id);

// PUT /api/stores/subscription/plan  { planId } — escolhe ou troca o plano (gera a fatura na hora)
export const choosePlan = async (req, res) => {
  await db.transaction((trx) => setPlan(trx, req.user.id, req.body.planId, { actor: 'store' }));
  await respond(res, req.user.id);
};

// POST /api/stores/subscription/invoices/:invoiceId/report-payment  { note? } — "Já paguei"
export const report = async (req, res) => {
  await db.transaction((trx) => reportPayment(trx, req.user.id, Number(req.params.invoiceId), req.body.note));
  await respond(res, req.user.id);
};

// GET /api/stores/me/export — cópia dos dados da loja (continua liberado com a conta suspensa)
export const exportData = async (req, res) => {
  const storeId = req.user.id;
  const [store, categories, products, variants, orders] = await Promise.all([
    db('stores').where({ id: storeId }).first(),
    db('categories').where({ store_id: storeId }).orderBy(['position', 'id']),
    db('products').where({ store_id: storeId }).orderBy(['position', 'id']),
    db('product_variants as v').join('products as p', 'p.id', 'v.product_id').where('p.store_id', storeId).select('v.*').orderBy(['v.position', 'v.id']),
    db('orders').where({ store_id: storeId }).orderBy('id'),
  ]);
  res.set('Content-Disposition', `attachment; filename="delivroo-${store.slug}.json"`);
  res.json({
    exportedAt: new Date().toISOString(),
    store: storeDto(store),
    categories: categories.map((c) => ({ id: c.id, name: c.name, position: c.position, active: !!c.active })),
    products: products.map((p) => ({
      id: p.id, categoryId: p.category_id, name: p.name, description: p.description, imageUrl: p.image_url, active: !!p.active,
      variants: variants.filter((v) => v.product_id === p.id).map((v) => ({ id: v.id, name: v.name, priceCents: v.price_cents, active: !!v.active })),
    })),
    orders: orders.map((o) => ({
      number: o.order_number, createdAt: o.created_at, status: o.status, customerName: o.customer_name, customerPhone: o.customer_phone,
      fulfillment: o.fulfillment, deliveryAddress: o.delivery_address, paymentMethod: o.payment_method_name,
      subtotalCents: o.subtotal_cents, deliveryFeeCents: o.delivery_fee_cents, totalCents: o.total_cents, notes: o.notes,
    })),
  });
};
