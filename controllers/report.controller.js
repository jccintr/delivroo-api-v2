import db from '../db/knex.js';
import { HttpError } from '../utils/errors.js';

// Fuso da loja (minutos em relação ao UTC). Brasil (Brasília) = -180. Define "dia" e "hora" dos relatórios.
const TZ_MINUTES = Number(process.env.STORE_TZ_OFFSET_MINUTES ?? -180);
const NOT_SOLD = ['REJECTED', 'CANCELED', 'RETURNED']; // não contam como venda
const DAY = 24 * 3600 * 1000;

const localDate = (date) => new Date(date.getTime() + TZ_MINUTES * 60000).toISOString().slice(0, 10);
const startOfLocalDay = (date) => new Date(Date.parse(`${localDate(date)}T00:00:00.000Z`) - TZ_MINUTES * 60000);

// GET /api/stores/reports/summary?from=&to=   (ISO; padrão: últimos 7 dias, até agora)
export const summary = async (req, res) => {
  const storeId = req.user.id;
  const to = req.query.to ? new Date(req.query.to) : new Date();
  const from = req.query.from ? new Date(req.query.from) : startOfLocalDay(new Date(to.getTime() - 6 * DAY));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new HttpError(400, 'from e to devem ser datas ISO.');
  if (to <= from) throw new HttpError(400, '"to" deve ser depois de "from".');
  if (to - from > 366 * DAY) throw new HttpError(400, 'Período máximo de 366 dias.');

  const base = () => db('orders').where({ store_id: storeId }).where('created_at', '>=', from).where('created_at', '<', to);
  const sold = () => base().whereNotIn('status', NOT_SOLD);
  const dayExpr = db.raw('DATE(DATE_ADD(created_at, INTERVAL ? MINUTE))', [TZ_MINUTES]);
  const hourExpr = db.raw('HOUR(DATE_ADD(created_at, INTERVAL ? MINUTE))', [TZ_MINUTES]);

  const [totals, byStatus, byDay, byHour, byFulfillment, byPayment, topProducts] = await Promise.all([
    sold().first(db.raw('COUNT(*) AS orders, COALESCE(SUM(total_cents),0) AS revenue, COALESCE(SUM(delivery_fee_cents),0) AS fees')),
    base().select('status').count({ n: 'id' }).groupBy('status'),
    sold().select({ day: dayExpr }).count({ orders: 'id' }).sum({ revenue: 'total_cents' }).groupBy('day'),
    sold().select({ hour: hourExpr }).count({ orders: 'id' }).groupBy('hour'),
    sold().select('fulfillment').count({ orders: 'id' }).sum({ revenue: 'total_cents' }).groupBy('fulfillment'),
    sold().select({ name: 'payment_method_name' }).count({ orders: 'id' }).sum({ revenue: 'total_cents' }).groupBy('payment_method_name').orderBy('revenue', 'desc'),
    db('order_items as i').join('orders as o', 'o.id', 'i.order_id')
      .where('o.store_id', storeId).where('o.created_at', '>=', from).where('o.created_at', '<', to).whereNotIn('o.status', NOT_SOLD)
      .select({ name: 'i.product_name' }).sum({ quantity: 'i.quantity', revenue: 'i.line_total_cents' })
      .groupBy('i.product_name').orderBy([{ column: 'quantity', order: 'desc' }, { column: 'revenue', order: 'desc' }]).limit(10),
  ]);

  const orders = Number(totals.orders);
  const revenue = Number(totals.revenue);

  // um registro por dia do período (dias sem venda aparecem zerados)
  const dayMap = new Map(byDay.map((d) => [String(d.day instanceof Date ? d.day.toISOString().slice(0, 10) : d.day).slice(0, 10), d]));
  const days = [];
  for (let t = startOfLocalDay(from).getTime(); t < to.getTime(); t += DAY) {
    const key = localDate(new Date(t));
    const row = dayMap.get(key);
    days.push({ date: key, orders: Number(row?.orders ?? 0), revenueCents: Number(row?.revenue ?? 0) });
  }

  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: Number(byHour.find((h) => Number(h.hour) === hour)?.orders ?? 0) }));
  const statusCount = Object.fromEntries(byStatus.map((s) => [s.status, Number(s.n)]));
  const notSold = NOT_SOLD.reduce((sum, s) => sum + (statusCount[s] ?? 0), 0);

  res.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    totals: {
      orders,
      revenueCents: revenue,
      averageTicketCents: orders ? Math.round(revenue / orders) : 0,
      deliveryFeesCents: Number(totals.fees),
      notSoldOrders: notSold, // recusados, cancelados e devolvidos
    },
    byStatus: statusCount,
    byDay: days,
    byHour: hours,
    byFulfillment: byFulfillment.map((f) => ({ fulfillment: f.fulfillment, orders: Number(f.orders), revenueCents: Number(f.revenue) })),
    byPayment: byPayment.map((p) => ({ name: p.name, orders: Number(p.orders), revenueCents: Number(p.revenue) })),
    topProducts: topProducts.map((p) => ({ name: p.name, quantity: Number(p.quantity), revenueCents: Number(p.revenue) })),
  });
};
