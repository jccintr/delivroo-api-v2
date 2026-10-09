import { body, param, query } from 'express-validator';
import { storeIdParam } from './admin.validator.js';

const idParam = (name) => param(name).isInt({ min: 1 }).withMessage('ID inválido');
const note = (field = 'note') => body(field).optional({ values: 'null' }).isString().withMessage(`${field} deve ser texto`).trim()
  .isLength({ max: 255 }).withMessage(`${field} deve ter no máximo 255 caracteres`);

// ---- planos (admin) ----
const planFields = (isUpdate) => {
  const opt = (chain) => (isUpdate ? chain.optional() : chain);
  return [
    opt(body('name')).trim().notEmpty().withMessage('Nome é obrigatório').isLength({ max: 80 }).withMessage('Nome deve ter até 80 caracteres'),
    body('description').optional({ values: 'null' }).isString().withMessage('Descrição deve ser texto').trim()
      .isLength({ max: 255 }).withMessage('Descrição deve ter até 255 caracteres'),
    opt(body('priceCents')).isInt({ min: 0, max: 100000000 }).withMessage('priceCents deve ser um inteiro em centavos').toInt(),
    body('position').optional().isInt({ min: 0, max: 10000 }).withMessage('position inválida').toInt(),
    body('active').optional().isBoolean({ strict: true }).withMessage('active deve ser true ou false'),
  ];
};
export const createPlanValidator = planFields(false);
export const updatePlanValidator = [idParam('id'), ...planFields(true)];
export const planIdParam = [idParam('id')];

// ---- assinatura / faturas (admin) ----
export const adminSetPlanValidator = [
  ...storeIdParam,
  body('planId').isInt({ min: 1 }).withMessage('planId inválido').toInt(),
];
export const extendTrialValidator = [
  ...storeIdParam,
  body('days').isInt({ min: 1, max: 365 }).withMessage('days deve ser de 1 a 365').toInt(),
];
export const courtesyValidator = [
  ...storeIdParam,
  body('indefinite').optional().isBoolean({ strict: true }).withMessage('indefinite deve ser true ou false'),
  body('until').optional({ values: 'null' }).matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('until deve estar no formato AAAA-MM-DD')
    .custom((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())).withMessage('Data inválida'),
  body().custom((b) => !(b.indefinite === true && b.until)).withMessage('Informe cortesia sem prazo OU uma data, não os dois'),
];
export const storeInvoiceParams = [...storeIdParam, idParam('invoiceId')];
export const payInvoiceValidator = [...storeInvoiceParams, note('note')];
export const voidInvoiceValidator = [...storeInvoiceParams, note('reason')];
export const listInvoicesValidator = [
  query('status').optional().isIn(['open', 'overdue', 'reported', 'paid', 'void', 'all']).withMessage('status inválido'),
  query('page').optional().isInt({ min: 1 }).withMessage('page inválida'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit deve ser de 1 a 100'),
];

// ---- assinatura (loja) ----
export const chooseOwnPlanValidator = [body('planId').isInt({ min: 1 }).withMessage('planId inválido').toInt()];
export const reportPaymentValidator = [idParam('invoiceId'), note('note')];
