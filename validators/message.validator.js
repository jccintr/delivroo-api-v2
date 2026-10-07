import { body, param } from 'express-validator';
import { MESSAGE_STATUSES } from '../services/messages.js';

export const statusParam = param('status').isIn(MESSAGE_STATUSES).withMessage('status inválido');

export const saveMessageValidator = [
  statusParam,
  body('body').isString().withMessage('Texto é obrigatório').bail().trim().isLength({ min: 1, max: 500 }).withMessage('O texto deve ter de 1 a 500 caracteres'),
];
