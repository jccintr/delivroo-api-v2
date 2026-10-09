import jsonwebtoken from 'jsonwebtoken';
import db from '../db/knex.js';
import { getStoreAccess, ACCESS, STORE_BLOCKED, SUBSCRIPTION_SUSPENDED } from '../services/storeAccess.js';

// Com a conta suspensa por falta de pagamento o painel fica restrito ao que é preciso para regularizar,
// terminar pedidos em andamento e baixar os dados. Todo o resto responde 402.
const ALLOWED_WHEN_SUSPENDED = [
  ['GET', /^\/me$/],
  ['GET', /^\/me\/export$/],
  ['GET', /^\/subscription$/],
  ['PUT', /^\/subscription\/plan$/],
  ['POST', /^\/subscription\/invoices\/\d+\/report-payment$/],
  ['POST', /^\/events-token$/],
  ['GET', /^\/orders(\/\d+)?$/],
  ['POST', /^\/orders\/\d+\/status$/],
];
const allowedWhenSuspended = (req) => ALLOWED_WHEN_SUSPENDED.some(([method, re]) => req.method === method && re.test(req.path));

// Valida o JWT e confere se a loja ainda existe e pode acessar (ver services/storeAccess.js).
const AuthStore = async (req, res, next) => {
  const bearer = req.headers['authorization'];
  const token = bearer?.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Não autorizado' });

  try {
    const decoded = jsonwebtoken.verify(token, process.env.JWT_SECRET_STORE);
    const store = await db('stores').where({ id: decoded.storeId }).first('id', 'active');
    if (!store) return res.status(401).json({ error: 'Não autorizado' });
    const subscription = await db('subscriptions').where({ store_id: store.id }).first();
    const access = getStoreAccess(store, subscription);

    // 401 (e não 403) de propósito: o painel já trata 401 como "sessão acabou" e leva para o login,
    // onde o login explica o bloqueio (403 + code). O `code` aqui ajuda quem quiser tratar direto.
    if (access.state === ACCESS.BLOCKED) return res.status(401).json({ error: 'Não autorizado', code: STORE_BLOCKED });
    if (access.state === ACCESS.SUSPENDED && !allowedWhenSuspended(req)) {
      return res.status(402).json({ error: 'Assinatura suspensa. Regularize o pagamento para voltar a usar o painel.', code: SUBSCRIPTION_SUSPENDED });
    }

    req.user = { id: store.id, role: 'store' };
    req.access = access;
    next();
  } catch {
    return res.status(401).json({ error: 'Não autorizado' });
  }
};

export default AuthStore;
