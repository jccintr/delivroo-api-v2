import jsonwebtoken from 'jsonwebtoken';
import db from '../db/knex.js';
import { isStoreBlocked, STORE_BLOCKED } from '../services/storeAccess.js';

// Valida o JWT e confere se a loja ainda existe e pode acessar (ver services/storeAccess.js).
const AuthStore = async (req, res, next) => {
  const bearer = req.headers['authorization'];
  const token = bearer?.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Não autorizado' });

  try {
    const decoded = jsonwebtoken.verify(token, process.env.JWT_SECRET_STORE);
    const store = await db('stores').where({ id: decoded.storeId }).first('id', 'active');
    if (!store) return res.status(401).json({ error: 'Não autorizado' });
    // 401 (e não 403) de propósito: o painel já trata 401 como "sessão acabou" e leva para o login,
    // onde o login explica o bloqueio (403 + code). O `code` aqui ajuda quem quiser tratar direto.
    if (isStoreBlocked(store)) return res.status(401).json({ error: 'Não autorizado', code: STORE_BLOCKED });

    req.user = { id: store.id, role: 'store' };
    next();
  } catch {
    return res.status(401).json({ error: 'Não autorizado' });
  }
};

export default AuthStore;
