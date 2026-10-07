import { body } from 'express-validator';
import { STATUSES } from '../services/orderStatus.js';

const delivery = body('fulfillment').equals('DELIVERY');

export const createOrderValidator = [
  body('fulfillment').isIn(['DELIVERY', 'PICKUP']).withMessage('fulfillment deve ser DELIVERY ou PICKUP'),
  body('name').trim().isLength({ min: 2, max: 120 }).withMessage('Nome deve ter de 2 a 120 caracteres'),
  body('phone')
    .customSanitizer((v) => String(v ?? '').replace(/\D/g, ''))
    .isLength({ min: 10, max: 13 }).withMessage('Telefone inválido'),
  body('deliveryZoneId').if(delivery).isInt({ min: 1 }).withMessage('deliveryZoneId é obrigatório para entrega'),
  body('address').if(delivery).trim().notEmpty().withMessage('Endereço é obrigatório para entrega').isLength({ max: 255 }),
  body('paymentMethodId').isInt({ min: 1 }).withMessage('paymentMethodId é obrigatório'),
  body('cashChangeForCents').optional({ values: 'null' }).isInt({ min: 1 }).withMessage('cashChangeForCents inválido'),
  body('notes').optional({ values: 'null' }).isString().isLength({ max: 500 }),
  body('items').isArray({ min: 1, max: 50 }).withMessage('O pedido precisa ter de 1 a 50 itens'),
  body('items.*.productId').isInt({ min: 1 }).withMessage('productId inválido').toInt(),
  body('items.*.variantId').isInt({ min: 1 }).withMessage('variantId inválido').toInt(),
  body('items.*.quantity').isInt({ min: 1, max: 99 }).withMessage('quantity deve ir de 1 a 99').toInt(),
  body('items.*.notes').optional({ values: 'null' }).isString().isLength({ max: 255 }),
  body('items.*.options').optional().isArray({ max: 100 }),
  body('items.*.options.*.groupId').isInt({ min: 1 }).withMessage('groupId inválido').toInt(),
  body('items.*.options.*.optionId').isInt({ min: 1 }).withMessage('optionId inválido').toInt(),
  body('items.*.options.*.quantity').optional().isInt({ min: 1, max: 99 }).toInt(),
];

export const changeStatusValidator = [
  body('status').isIn(STATUSES.filter((s) => s !== 'RECEIVED')).withMessage('status inválido'),
  body('reason').optional({ values: 'null' }).isString().isLength({ max: 255 }),
];
