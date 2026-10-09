import jsonwebtoken from 'jsonwebtoken';

// O admin geral usa segredo PRÓPRIO (JWT_SECRET_ADMIN): um token de loja nunca vale como token de admin
// e vice-versa, mesmo que alguém copie o token de um lado para o outro.
export function adminSecret() {
  const secret = process.env.JWT_SECRET_ADMIN;
  if (!secret) throw new Error('JWT_SECRET_ADMIN não configurado.');
  return secret;
}

// Expiração curta de propósito (padrão 12h): o painel do admin é sensível.
export const signAdminToken = (adminId) =>
  jsonwebtoken.sign({ adminId, role: 'admin' }, adminSecret(), { expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '12h' });

export const verifyAdminToken = (token) => {
  const decoded = jsonwebtoken.verify(token, adminSecret());
  if (decoded.role !== 'admin' || !decoded.adminId) throw new Error('token sem papel de admin');
  return decoded;
};
