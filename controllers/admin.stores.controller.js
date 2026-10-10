import db from '../db/knex.js';
import { notFound } from '../utils/errors.js';
import { adminStoreDto } from '../utils/dto.js';
import { logAdminAction, parseDetails } from '../services/audit.js';
import { getBillingStatus } from '../services/storeAccess.js';

// Colunas extras de cada loja: quantos pedidos já recebeu e quando foi o último (para achar loja parada).
const withStats = (q) => q
  .leftJoin('cities as c', 'c.id', 's.city_id')
  .leftJoin('subscriptions as sub', 'sub.store_id', 's.id')
  .leftJoin('plans as pl', 'pl.id', 'sub.plan_id')
  .select(
    's.*', 'c.name as city_name', 'c.state as city_state',
    'sub.trial_ends_on', 'sub.paid_until', 'sub.courtesy_until', 'sub.courtesy_indefinite', 'sub.id as subscription_id',
    'pl.name as plan_name',
    db.raw('(SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id) AS orders_count'),
    db.raw('(SELECT MAX(o.created_at) FROM orders o WHERE o.store_id = s.id) AS last_order_at'),
  );

// Situação de cobrança calculada na leitura (a mesma regra que decide o acesso).
const withBilling = (row) => {
  if (!row.subscription_id) return row;
  const b = getBillingStatus(row);
  return { ...row, billing_status: b.status, billing_covered_through: b.coveredThrough };
};

const escapeLike = (text) => text.replace(/[\\%_]/g, '\\$&');
const pageParams = (req, defaultLimit = 20) => ({
  page: Math.max(1, Number(req.query.page) || 1),
  limit: Math.min(100, Math.max(1, Number(req.query.limit) || defaultLimit)),
});

// GET /api/admin/stores?search=&status=all|active|inactive&cityId=&page=&limit=
export const list = async (req, res) => {
  const { search = '', status = 'all', cityId } = req.query;
  const { page, limit } = pageParams(req);

  const filtered = db('stores as s');
  const term = String(search).trim();
  if (term) {
    const like = `%${escapeLike(term)}%`;
    filtered.where((w) => w.whereRaw('s.name LIKE ?', [like]).orWhereRaw('s.email LIKE ?', [like]).orWhereRaw('s.slug LIKE ?', [like]));
  }
  if (status === 'active') filtered.where('s.active', true);
  if (status === 'inactive') filtered.where('s.active', false);
  if (cityId) filtered.where('s.city_id', Number(cityId));

  const { total } = await filtered.clone().count({ total: 's.id' }).first();
  const rows = await withStats(filtered.clone())
    .orderBy([{ column: 's.created_at', order: 'desc' }, { column: 's.id', order: 'desc' }])
    .limit(limit).offset((page - 1) * limit);

  res.json({ page, limit, total: Number(total), stores: rows.map((r) => adminStoreDto(withBilling(r))) });
};

// GET /api/admin/stores/:id
export const get = async (req, res) => {
  const row = await withStats(db('stores as s').where('s.id', Number(req.params.id))).first();
  if (!row) throw notFound('Loja');
  const { products } = await db('products').where({ store_id: row.id }).count({ products: 'id' }).first();
  res.json({ ...adminStoreDto(withBilling(row)), productsCount: Number(products) });
};

// PATCH /api/admin/stores/:id/active  { active, reason? }
// Bloqueio MANUAL: a loja não entra, o cardápio some e não recebe pedidos. Fica registrado na auditoria.
export const setActive = async (req, res) => {
  const id = Number(req.params.id);
  const { active, reason } = req.body;

  await db.transaction(async (trx) => {
    const store = await trx('stores').where({ id }).forUpdate().first('id', 'active');
    if (!store) throw notFound('Loja');
    if (!!store.active === active) return; // já está assim: não muda nada e não polui a auditoria

    if (active) {
      await trx('stores').where({ id }).update({ active: true, deactivated_at: null, deactivation_reason: null });
    } else {
      // fecha a loja junto: ao reativar, ela não pode "ressuscitar" aberta sem o dono saber
      await trx('stores').where({ id }).update({
        active: false, is_open: false, deactivated_at: db.fn.now(3), deactivation_reason: reason || null,
      });
    }
    await logAdminAction({
      adminId: req.admin.id, storeId: id,
      action: active ? 'STORE_ACTIVATED' : 'STORE_DEACTIVATED',
      details: active ? null : { reason: reason || null },
    }, trx);
  });

  const row = await withStats(db('stores as s').where('s.id', id)).first();
  res.json(adminStoreDto(withBilling(row)));
};

// GET /api/admin/audit-log?storeId=&page=&limit=
export const auditLog = async (req, res) => {
  const { storeId } = req.query;
  const { page, limit } = pageParams(req, 30);

  const filtered = db('admin_audit_log as l');
  if (storeId) filtered.where('l.store_id', Number(storeId));

  const { total } = await filtered.clone().count({ total: 'l.id' }).first();
  const rows = await filtered.clone()
    .leftJoin('admins as a', 'a.id', 'l.admin_id')
    .leftJoin('stores as s', 's.id', 'l.store_id')
    .select('l.*', 'a.name as admin_name', 'a.email as admin_email', 's.name as store_name')
    .orderBy([{ column: 'l.created_at', order: 'desc' }, { column: 'l.id', order: 'desc' }])
    .limit(limit).offset((page - 1) * limit);

  res.json({
    page, limit, total: Number(total),
    entries: rows.map((r) => ({
      id: r.id,
      action: r.action,
      admin: { id: r.admin_id, name: r.admin_name, email: r.admin_email },
      store: r.store_id ? { id: r.store_id, name: r.store_name } : null,
      details: parseDetails(r.details),
      createdAt: r.created_at,
    })),
  });
};

// GET /api/admin/cities — só cidades que têm loja (alimenta o filtro da lista de lojas)
export const citiesWithStores = async (req, res) => {
  const rows = await db('cities as c')
    .join('stores as s', 's.city_id', 'c.id')
    .groupBy('c.id', 'c.name', 'c.state', 'c.slug')
    .select('c.id', 'c.name', 'c.state', 'c.slug', db.raw('COUNT(s.id) AS stores_count'))
    .orderBy(['c.name', 'c.state']);
  res.json(rows.map((r) => ({ id: r.id, name: r.name, state: r.state, slug: r.slug, storesCount: Number(r.stores_count) })));
};
