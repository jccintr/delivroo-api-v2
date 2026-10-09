import db from '../db/knex.js';
import { verifyAdminToken, adminSecret } from '../services/adminAuth.js';

// Valida o JWT do admin geral e confere se o admin ainda existe e está ativo
// (desativar um admin derruba o acesso dele na hora, sem esperar o token expirar).
const AuthAdmin = async (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Não autorizado' });

  adminSecret(); // servidor mal configurado vira 500 (com log), não um 401 enganoso

  try {
    const decoded = verifyAdminToken(token);
    const admin = await db('admins').where({ id: decoded.adminId }).first('id', 'name', 'email', 'active');
    if (!admin || !admin.active) return res.status(401).json({ error: 'Não autorizado' });
    req.admin = { id: admin.id, name: admin.name, email: admin.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Não autorizado' });
  }
};

export default AuthAdmin;
