import { body, param, query } from 'express-validator';
import { ADMIN_PASSWORD_MAX, ADMIN_PASSWORD_MIN } from '../services/adminAccounts.js';

export const adminLoginValidator = [
  body('email').trim().toLowerCase().notEmpty().withMessage('Email é obrigatório').isEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('Senha é obrigatória'),
];

export const changePasswordValidator = [
  body('currentPassword').notEmpty().withMessage('Informe a senha atual'),
  body('newPassword').isString().withMessage('Informe a nova senha')
    .isLength({ min: ADMIN_PASSWORD_MIN, max: ADMIN_PASSWORD_MAX })
    .withMessage(`A nova senha deve ter de ${ADMIN_PASSWORD_MIN} a ${ADMIN_PASSWORD_MAX} caracteres`),
];

const page = () => query('page').optional().isInt({ min: 1 }).withMessage('page inválida');
const limit = () => query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit deve ser de 1 a 100');

export const listStoresValidator = [
  query('search').optional().isString().isLength({ max: 120 }).withMessage('search muito longo'),
  query('status').optional().isIn(['all', 'active', 'inactive']).withMessage('status deve ser all, active ou inactive'),
  query('cityId').optional().isInt({ min: 1 }).withMessage('cityId inválido'),
  page(),
  limit(),
];

export const storeIdParam = [param('id').isInt({ min: 1 }).withMessage('ID inválido')];

export const setActiveValidator = [
  ...storeIdParam,
  body('active').isBoolean({ strict: true }).withMessage('active deve ser true ou false'),
  body('reason').optional({ values: 'null' }).isString().withMessage('reason deve ser texto').trim()
    .isLength({ max: 255 }).withMessage('reason deve ter no máximo 255 caracteres'),
];

export const auditLogValidator = [
  query('storeId').optional().isInt({ min: 1 }).withMessage('storeId inválido'),
  page(),
  limit(),
];
