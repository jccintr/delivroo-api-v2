import { body } from 'express-validator';

export const registerStoreValidator = [
  body('name').trim().notEmpty().withMessage('Nome é obrigatório').isLength({ min: 3, max: 120 }).withMessage('Nome deve ter de 3 a 120 caracteres'),
  body('email').trim().notEmpty().withMessage('Email é obrigatório').isEmail().withMessage('Email inválido').normalizeEmail(),
  body('password').notEmpty().withMessage('Senha é obrigatória').isLength({ min: 6 }).withMessage('Senha deve ter pelo menos 6 caracteres'),
  body('phone').trim().notEmpty().withMessage('Telefone é obrigatório'),
  body('cityId').notEmpty().withMessage('Cidade é obrigatória').isInt({ min: 1 }).withMessage('ID da cidade inválido'),
];

export const loginValidator = [
  body('email').trim().notEmpty().withMessage('Email é obrigatório').isEmail().withMessage('Email inválido').normalizeEmail(),
  body('password').notEmpty().withMessage('Senha é obrigatória'),
];

const color = (field) =>
  body(field).optional({ values: 'null' }).matches(/^#[0-9a-fA-F]{6}$/).withMessage(`${field} deve estar no formato #RRGGBB`);

export const updateProfileValidator = [
  body('name').optional().trim().isLength({ min: 3, max: 120 }).withMessage('Nome deve ter de 3 a 120 caracteres'),
  body('phone').optional().trim().notEmpty().withMessage('Telefone não pode ficar vazio'),
  body('cityId').optional().isInt({ min: 1 }).withMessage('ID da cidade inválido'),
  body('street').optional({ values: 'null' }).isString().isLength({ max: 160 }),
  body('number').optional({ values: 'null' }).isString().isLength({ max: 20 }),
  body('complement').optional({ values: 'null' }).isString().isLength({ max: 80 }),
  body('district').optional({ values: 'null' }).isString().isLength({ max: 100 }),
  body('zipCode').optional({ values: 'null' }).isString().isLength({ max: 9 }),
  body('latitude').optional({ values: 'null' }).isFloat({ min: -90, max: 90 }),
  body('longitude').optional({ values: 'null' }).isFloat({ min: -180, max: 180 }),
  body('logoUrl').optional({ values: 'null' }).isURL().withMessage('logoUrl inválida'),
  color('bgColor'),
  color('textColor'),
  body('pixKey').optional({ values: 'null' }).isString().isLength({ max: 140 }),
  body('pixBeneficiary').optional({ values: 'null' }).isString().isLength({ max: 140 }),
  body('waitMinMinutes').optional({ values: 'null' }).isInt({ min: 0, max: 600 }),
  body('waitMaxMinutes').optional({ values: 'null' }).isInt({ min: 0, max: 600 }),
];

export const statusValidator = [body('isOpen').isBoolean({ strict: true }).withMessage('isOpen deve ser true ou false')];

export const deliveryZoneValidator = (partial = false) => [
  body('district').if(() => !partial).trim().notEmpty().withMessage('Bairro é obrigatório'),
  body('district').if(() => partial).optional().trim().notEmpty().withMessage('Bairro não pode ficar vazio'),
  body('feeCents').if(() => !partial).isInt({ min: 0 }).withMessage('feeCents deve ser inteiro >= 0'),
  body('feeCents').if(() => partial).optional().isInt({ min: 0 }).withMessage('feeCents deve ser inteiro >= 0'),
  body('active').optional().isBoolean({ strict: true }),
];

export const paymentMethodValidator = (partial = false) => [
  body('name').if(() => !partial).trim().notEmpty().withMessage('Nome é obrigatório'),
  body('name').if(() => partial).optional().trim().notEmpty().withMessage('Nome não pode ficar vazio'),
  body('type').optional().isIn(['CASH', 'PIX', 'CARD', 'OTHER']).withMessage('type inválido'),
  body('position').optional().isInt({ min: 0 }),
  body('active').optional().isBoolean({ strict: true }),
];

export const businessHoursValidator = [
  body('hours').isArray({ max: 50 }).withMessage('hours deve ser uma lista'),
  body('hours.*.weekday').isInt({ min: 0, max: 6 }).withMessage('weekday deve ir de 0 (domingo) a 6 (sábado)'),
  body('hours.*.opensAt').matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('opensAt deve ser HH:MM'),
  body('hours.*.closesAt').matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('closesAt deve ser HH:MM'),
];
