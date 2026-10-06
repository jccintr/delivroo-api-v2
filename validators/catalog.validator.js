import { body } from 'express-validator';


const pricesMap = body('prices').optional().custom((value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('prices deve ser um objeto { variantId: centavos }');
  for (const [k, v] of Object.entries(value)) {
    if (!/^\d+$/.test(k) || !Number.isInteger(v) || v < 0) throw new Error('prices: use ids de variação e valores inteiros >= 0');
  }
  return true;
});

export const categoryValidator = (partial = false) => [
  body('name').if(() => !partial).trim().notEmpty().withMessage('Nome é obrigatório'),
  body('name').if(() => partial).optional().trim().notEmpty().withMessage('Nome não pode ficar vazio'),
  body('position').optional().isInt({ min: 0 }),
  body('active').optional().isBoolean({ strict: true }),
];

const variantFields = (prefix, required) => {
  const f = (name) => `${prefix}${name}`;
  return [
    (required ? body(f('name')).trim().notEmpty() : body(f('name')).optional().trim().notEmpty()).withMessage('Nome da variação é obrigatório').isLength({ max: 60 }),
    (required ? body(f('priceCents')) : body(f('priceCents')).optional()).isInt({ min: 0, max: 4294967295 }).withMessage('priceCents deve ser inteiro em centavos (>= 0)'),
    body(f('description')).optional({ values: 'null' }).isString().isLength({ max: 120 }),
    body(f('position')).optional().isInt({ min: 0 }),
    body(f('active')).optional().isBoolean({ strict: true }),
  ];
};

export const createProductValidator = [
  body('categoryId').isInt({ min: 1 }).withMessage('categoryId inválido'),
  body('name').trim().notEmpty().withMessage('Nome é obrigatório').isLength({ max: 120 }),
  body('description').optional({ values: 'null' }).isString().isLength({ max: 500 }),
  body('imageUrl').optional({ values: 'null' }).isURL().withMessage('imageUrl inválida'),
  body('position').optional().isInt({ min: 0 }),
  body('active').optional().isBoolean({ strict: true }),
  body('variants').isArray({ min: 1, max: 20 }).withMessage('Informe de 1 a 20 variações (produto simples usa uma só, ex.: "Único")'),
  ...variantFields('variants.*.', true),
];

export const updateProductValidator = [
  body('categoryId').optional().isInt({ min: 1 }).withMessage('categoryId inválido'),
  body('name').optional().trim().notEmpty().isLength({ max: 120 }),
  body('description').optional({ values: 'null' }).isString().isLength({ max: 500 }),
  body('imageUrl').optional({ values: 'null' }).isURL().withMessage('imageUrl inválida'),
  body('position').optional().isInt({ min: 0 }),
  body('active').optional().isBoolean({ strict: true }),
];

export const createVariantValidator = variantFields('', true);
export const updateVariantValidator = variantFields('', false);

export const productGroupsValidator = [
  body('groupIds').isArray({ max: 20 }).withMessage('groupIds deve ser uma lista'),
  body('groupIds.*').isInt({ min: 1 }).withMessage('id de grupo inválido'),
];

const groupFields = (partial) => {
  return [
    (partial ? body('name').optional().trim().notEmpty() : body('name').trim().notEmpty()).withMessage('Nome é obrigatório').isLength({ max: 80 }),
    body('minSelect').optional().isInt({ min: 0, max: 255 }),
    body('maxSelect').optional().isInt({ min: 1, max: 255 }),
    body('maxPerOption').optional().isInt({ min: 1, max: 255 }),
    body('pricingMode').optional().isIn(['ADDITIVE', 'HIGHEST']).withMessage('pricingMode deve ser ADDITIVE ou HIGHEST'),
    body('active').optional().isBoolean({ strict: true }),
  ];
};

const optionFields = (prefix, required) => {
  const f = (n) => `${prefix}${n}`;
  return [
    (required ? body(f('name')).trim().notEmpty() : body(f('name')).optional().trim().notEmpty()).withMessage('Nome da opção é obrigatório').isLength({ max: 120 }),
    body(f('description')).optional({ values: 'null' }).isString().isLength({ max: 500 }),
    body(f('imageUrl')).optional({ values: 'null' }).isURL().withMessage('imageUrl inválida'),
    body(f('priceCents')).optional().isInt({ min: 0, max: 4294967295 }).withMessage('priceCents deve ser inteiro em centavos (>= 0)'),
    body(f('isDefault')).optional().isBoolean({ strict: true }),
    body(f('position')).optional().isInt({ min: 0 }),
    body(f('active')).optional().isBoolean({ strict: true }),
  ];
};

export const createGroupValidator = [
  ...groupFields(false),
  body('options').optional().isArray({ max: 100 }),
  ...optionFields('options.*.', true),
];
export const updateGroupValidator = groupFields(true);
export const createOptionValidator = [...optionFields('', true), pricesMap];
export const updateOptionValidator = [...optionFields('', false), pricesMap];

