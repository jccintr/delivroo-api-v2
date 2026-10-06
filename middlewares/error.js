import { HttpError } from '../utils/errors.js';
import { PricingError } from '../services/pricing.js';

export const notFoundHandler = (req, res) => res.status(404).json({ error: 'Rota não encontrada.' });

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
  if (err instanceof PricingError) return res.status(422).json({ error: err.message, code: err.code });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
  if (err?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Registro duplicado.' });
  if (err?.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ error: 'Registro em uso e não pode ser removido.' });

  console.error('Erro não tratado:', err);
  return res.status(500).json({ error: 'Erro interno do servidor.' });
};
