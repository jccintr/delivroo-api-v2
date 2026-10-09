import bcryptjs from 'bcryptjs';
import db from '../db/knex.js';
import { HttpError, notFound } from '../utils/errors.js';
import { adminDto } from '../utils/dto.js';
import { signAdminToken } from '../services/adminAuth.js';
import { logAdminAction } from '../services/audit.js';
import { adminLoginThrottle } from '../utils/loginThrottle.js';

// Hash "isca": quando o email não existe, ainda gastamos o mesmo tempo do bcrypt,
// para o tempo de resposta não revelar quais emails são admins.
let decoyHash;
const getDecoyHash = () => (decoyHash ??= bcryptjs.hashSync('senha-isca-nao-usada', 10));

// POST /api/admin/login
export const login = async (req, res) => {
  const { email, password } = req.body;

  const wait = adminLoginThrottle.blockedFor(email);
  if (wait > 0) {
    res.set('Retry-After', String(wait));
    throw new HttpError(429, 'Muitas tentativas de login. Tente novamente mais tarde.', { retryAfterSeconds: wait });
  }

  const admin = await db('admins').where({ email }).first();
  const passwordOk = await bcryptjs.compare(password, admin?.password_hash ?? getDecoyHash());
  if (!admin || !passwordOk) {
    adminLoginThrottle.fail(email);
    throw new HttpError(401, 'Email e/ou senha inválidos.');
  }
  if (!admin.active) throw new HttpError(403, 'Conta desativada.');

  adminLoginThrottle.reset(email);
  await db('admins').where({ id: admin.id }).update({ last_login_at: db.fn.now(3) });
  const fresh = await db('admins').where({ id: admin.id }).first();
  res.json({ token: signAdminToken(admin.id), admin: adminDto(fresh) });
};

// GET /api/admin/me
export const me = async (req, res) => {
  const admin = await db('admins').where({ id: req.admin.id }).first();
  if (!admin) throw notFound('Admin');
  res.json(adminDto(admin));
};

// PATCH /api/admin/me/password  { currentPassword, newPassword }
// (os tokens já emitidos continuam valendo até expirar — por isso a expiração é curta)
export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const admin = await db('admins').where({ id: req.admin.id }).first();

  if (!(await bcryptjs.compare(currentPassword, admin.password_hash))) {
    // 422 e não 401: um 401 faria o painel achar que o token venceu e deslogar a pessoa
    throw new HttpError(422, 'Senha atual incorreta.');
  }
  if (currentPassword === newPassword) throw new HttpError(422, 'A nova senha deve ser diferente da atual.');

  const password_hash = await bcryptjs.hash(newPassword, 10);
  await db.transaction(async (trx) => {
    await trx('admins').where({ id: admin.id }).update({ password_hash });
    await logAdminAction({ adminId: admin.id, action: 'ADMIN_PASSWORD_CHANGED' }, trx);
  });
  res.status(204).end();
};
