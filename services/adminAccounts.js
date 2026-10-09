import bcryptjs from 'bcryptjs';
import { HttpError } from '../utils/errors.js';
import { logAdminAction } from './audit.js';

export const ADMIN_PASSWORD_MIN = 10;
export const ADMIN_PASSWORD_MAX = 72; // limite do bcrypt

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const normalizeAdminEmail = (email) => String(email ?? '').trim().toLowerCase();

function validate({ name, email, password }, { needName }) {
  const problems = [];
  if (needName && (!name || String(name).trim().length < 3 || String(name).trim().length > 120)) problems.push('Nome deve ter de 3 a 120 caracteres.');
  if (!EMAIL_RE.test(normalizeAdminEmail(email))) problems.push('Email inválido.');
  if (!password || password.length < ADMIN_PASSWORD_MIN || password.length > ADMIN_PASSWORD_MAX) {
    problems.push(`Senha deve ter de ${ADMIN_PASSWORD_MIN} a ${ADMIN_PASSWORD_MAX} caracteres.`);
  }
  if (problems.length) throw new HttpError(422, problems.join(' '));
}

// Usado pelo script `npm run admin:create`. Não existe endpoint público para criar admin, de propósito.
export async function createAdmin(db, { name, email, password }) {
  validate({ name, email, password }, { needName: true });
  const normalized = normalizeAdminEmail(email);
  if (await db('admins').where({ email: normalized }).first('id')) throw new HttpError(409, 'Já existe um admin com esse email.');
  const [id] = await db('admins').insert({
    name: String(name).trim(), email: normalized, password_hash: await bcryptjs.hash(password, 10),
  });
  return db('admins').where({ id }).first('id', 'name', 'email', 'active');
}

// Recuperação de acesso (esqueci a senha do admin): só por script, com acesso ao servidor.
export async function resetAdminPassword(db, { email, password }) {
  validate({ email, password }, { needName: false });
  const admin = await db('admins').where({ email: normalizeAdminEmail(email) }).first('id', 'name', 'email', 'active');
  if (!admin) throw new HttpError(404, 'Admin não encontrado.');
  await db.transaction(async (trx) => {
    await trx('admins').where({ id: admin.id }).update({ password_hash: await bcryptjs.hash(password, 10), active: true });
    await logAdminAction({ adminId: admin.id, action: 'ADMIN_PASSWORD_RESET_CLI', details: { via: 'script' } }, trx);
  });
  return admin;
}
