import jsonwebtoken from 'jsonwebtoken';
import db from '../db/knex.js';

// Valida o JWT e confere se a loja ainda existe e está ativa.
const AuthStore = async (req, res, next) => {
  const bearer = req.headers['authorization'];
  const token = bearer?.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Não autorizado' });

  try {
    const decoded = jsonwebtoken.verify(token, process.env.JWT_SECRET_STORE);
    const store = await db('stores').where({ id: decoded.storeId }).first('id', 'active');
    if (!store || !store.active) return res.status(401).json({ error: 'Não autorizado' });

    req.user = { id: store.id, role: 'store' };
    next();
  } catch {
    return res.status(401).json({ error: 'Não autorizado' });
  }
};

export default AuthStore;
