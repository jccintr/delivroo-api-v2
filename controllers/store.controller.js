import bcryptjs from 'bcryptjs';
import jsonwebtoken from 'jsonwebtoken';
import db from '../db/knex.js';
import { HttpError, notFound } from '../utils/errors.js';
import { storeDto, hourDto } from '../utils/dto.js';
import { uniqueStoreSlug } from '../utils/slug.js';
import { isStoreBlocked, STORE_BLOCKED } from '../services/storeAccess.js';

const signToken = (storeId) =>
  jsonwebtoken.sign({ storeId }, process.env.JWT_SECRET_STORE, { expiresIn: process.env.JWT_EXPIRES_IN || '30d' });

// POST /api/stores/register
export const register = async (req, res) => {
  const { name, email, password, phone, cityId } = req.body;

  const city = await db('cities').where({ id: cityId, active: true }).first('id');
  if (!city) throw new HttpError(422, 'Cidade inválida.');

  if (await db('stores').where({ email }).first('id')) throw new HttpError(409, 'Email já cadastrado.');

  const slug = await uniqueStoreSlug(db, name);
  const [id] = await db('stores').insert({
    slug, name, email, phone, city_id: cityId,
    password_hash: await bcryptjs.hash(password, 10),
  });

  const store = await db('stores').where({ id }).first();
  res.status(201).json({ token: signToken(id), store: storeDto(store) });
};

// POST /api/stores/login
export const login = async (req, res) => {
  const { email, password } = req.body;
  const store = await db('stores').where({ email }).first();

  // mesma resposta para email inexistente e senha errada
  if (!store || !(await bcryptjs.compare(password, store.password_hash))) {
    throw new HttpError(401, 'Email e/ou senha inválidos.');
  }
  // `code` permite ao painel mostrar a mensagem certa (hoje só o bloqueio do admin; no futuro, assinatura)
  if (isStoreBlocked(store)) throw new HttpError(403, 'Conta desativada.', { code: STORE_BLOCKED });

  res.json({ token: signToken(store.id), store: storeDto(store) });
};

// GET /api/stores/me
export const me = async (req, res) => {
  const store = await db('stores').where({ id: req.user.id }).first();
  if (!store) throw notFound('Loja');
  res.json(storeDto(store));
};

const PROFILE_COLUMNS = {
  name: 'name', phone: 'phone', cityId: 'city_id', street: 'street', number: 'number',
  complement: 'complement', district: 'district', zipCode: 'zip_code', latitude: 'latitude',
  longitude: 'longitude', logoUrl: 'logo_url', bgColor: 'bg_color', textColor: 'text_color',
  pixKey: 'pix_key', pixBeneficiary: 'pix_beneficiary', waitMinMinutes: 'wait_min_minutes',
  waitMaxMinutes: 'wait_max_minutes',
};

// PATCH /api/stores/me
export const updateProfile = async (req, res) => {
  const data = {};
  for (const [camel, snake] of Object.entries(PROFILE_COLUMNS)) {
    if (req.body[camel] !== undefined) data[snake] = req.body[camel];
  }

  if (data.city_id && !(await db('cities').where({ id: data.city_id, active: true }).first('id'))) {
    throw new HttpError(422, 'Cidade inválida.');
  }

  const current = await db('stores').where({ id: req.user.id }).first('wait_min_minutes', 'wait_max_minutes');
  const min = data.wait_min_minutes !== undefined ? data.wait_min_minutes : current.wait_min_minutes;
  const max = data.wait_max_minutes !== undefined ? data.wait_max_minutes : current.wait_max_minutes;
  if (min != null && max != null && Number(max) < Number(min)) {
    throw new HttpError(422, 'O tempo máximo de espera não pode ser menor que o mínimo.');
  }

  if (Object.keys(data).length) await db('stores').where({ id: req.user.id }).update(data);
  res.json(storeDto(await db('stores').where({ id: req.user.id }).first()));
};

// PATCH /api/stores/me/status  { isOpen }
export const setOpen = async (req, res) => {
  const store = await db('stores').where({ id: req.user.id }).first('is_open');
  const isOpen = req.body.isOpen;

  const data = { is_open: isOpen };
  if (isOpen && !store.is_open) data.opened_at = new Date(); // começa um novo turno
  await db('stores').where({ id: req.user.id }).update(data);

  res.json(storeDto(await db('stores').where({ id: req.user.id }).first()));
};

// GET /api/stores/me/business-hours
export const listBusinessHours = async (req, res) => {
  const rows = await db('business_hours').where({ store_id: req.user.id }).orderBy(['weekday', 'opens_at']);
  res.json(rows.map(hourDto));
};

// PUT /api/stores/me/business-hours  { hours: [{ weekday, opensAt, closesAt }] } — substitui tudo
export const replaceBusinessHours = async (req, res) => {
  const rows = req.body.hours.map((h) => ({
    store_id: req.user.id, weekday: h.weekday, opens_at: `${h.opensAt}:00`, closes_at: `${h.closesAt}:00`,
  }));

  const keys = new Set(rows.map((r) => `${r.weekday}-${r.opens_at}`));
  if (keys.size !== rows.length) throw new HttpError(422, 'Há horários repetidos no mesmo dia.');

  await db.transaction(async (trx) => {
    await trx('business_hours').where({ store_id: req.user.id }).del();
    if (rows.length) await trx('business_hours').insert(rows);
  });

  const saved = await db('business_hours').where({ store_id: req.user.id }).orderBy(['weekday', 'opens_at']);
  res.json(saved.map(hourDto));
};
