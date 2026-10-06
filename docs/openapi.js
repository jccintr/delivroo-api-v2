// Especificação OpenAPI 3.0 da Delivroo API v2 (servida em /docs e /openapi.json).
// Dinheiro SEMPRE em centavos (campos *Cents). Datas em UTC (ISO 8601).

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema, example) => ({ 'application/json': { schema, ...(example !== undefined ? { example } : {}) } });
const body = (schema, example, required = true) => ({ required, content: json(schema, example) });
const ok = (description, schema, example) => ({ description, content: json(schema, example) });
const arrayOf = (name) => ({ type: 'array', items: ref(name) });

const idParam = (name = 'id', description = 'ID') => ({
  name, in: 'path', required: true, description, schema: { type: 'integer', minimum: 1 }, example: 1,
});

const errRef = (description) => ({ description, content: json(ref('Error')) });
const R = {
  400: errRef('Dados inválidos (validação)'),
  401: errRef('Token ausente, inválido ou loja desativada'),
  404: errRef('Não encontrado (ou pertence a outra loja)'),
  409: errRef('Conflito (duplicado, em uso ou transição de status inválida)'),
  422: errRef('Regra de negócio violada'),
  204: { description: 'Removido com sucesso (sem corpo)' },
};
const authed = { 401: R[401] };

const secured = [{ bearerAuth: [] }];

// atalhos para as 4 operações de CRUD simples (zonas, pagamentos, categorias)
function crud({ tag, base, schema, createSchema, updateSchema, createExample, label }) {
  return {
    [base]: {
      get: { tags: [tag], summary: `Listar ${label}`, security: secured, responses: { 200: ok('Lista', arrayOf(schema)), ...authed } },
      post: {
        tags: [tag], summary: `Criar ${label}`, security: secured,
        requestBody: body(ref(createSchema), createExample),
        responses: { 201: ok('Criado', ref(schema)), 400: R[400], ...authed },
      },
    },
    [`${base}/{id}`]: {
      patch: {
        tags: [tag], summary: `Atualizar ${label} (parcial)`, security: secured, parameters: [idParam()],
        requestBody: body(ref(updateSchema), undefined),
        responses: { 200: ok('Atualizado', ref(schema)), 400: R[400], 404: R[404], ...authed },
      },
      delete: {
        tags: [tag], summary: `Remover ${label}`, security: secured, parameters: [idParam()],
        responses: { 204: R[204], 404: R[404], 409: R[409], ...authed },
      },
    },
  };
}

const orderExample = {
  fulfillment: 'DELIVERY',
  name: 'Maria Silva',
  phone: '(35) 99999-1234',
  deliveryZoneId: 1,
  address: 'Rua das Flores, 100',
  paymentMethodId: 2, // 2 = Dinheiro na loja de exemplo
  cashChangeForCents: 10000,
  notes: 'Sem cebola',
  items: [{
    productId: 1, variantId: 2, quantity: 1, notes: 'Bem passada',
    options: [{ groupId: 1, optionId: 1 }, { groupId: 1, optionId: 2 }, { groupId: 2, optionId: 5 }],
  }],
};

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Delivroo API v2',
    version: '2.0.0',
    description: [
      'API do **Delivroo 2**: cardápio público, pedidos e painel da loja.',
      '',
      '### Como testar',
      '1. `POST /api/stores/login` com `loja@exemplo.com` / `123456` (loja de exemplo criada por `npm run seed:demo`) — ou crie uma loja em `/api/stores/register`.',
      '2. Copie o `token` da resposta, clique em **Authorize** (cadeado, no topo) e cole o token (sem a palavra "Bearer").',
      '3. Agora os endpoints com cadeado funcionam com **Try it out**.',
      '4. Sem login: `GET /api/public/stores/pizzaria-exemplo/menu` e `POST /api/public/stores/pizzaria-exemplo/orders`.',
      '',
      '### Convenções',
      '- Dinheiro em **centavos** inteiros (`priceCents: 4500` = R$ 45,00). O cliente **nunca** envia preços: o servidor recalcula tudo no pedido.',
      '- Produto = **variações** (tamanho/porção; preço base) + **grupos de opções** (sabores, borda, adicionais…). Pizza é só um produto com variações Broto/Grande e grupos Sabores/Borda — não há flag especial.',
      '- Erros: `{ "error": "mensagem" }`; validação (400) traz também `details: [{ field, message }]`.',
      '- Rotas da loja ficam sempre isoladas pela loja do token: um ID de outra loja responde 404.',
    ].join('\n'),
  },
  servers: [{ url: '/', description: 'Servidor atual' }],
  tags: [
    { name: 'Público', description: 'Sem login — usado pelo cardápio do cliente' },
    { name: 'Conta', description: 'Cadastro, login e perfil da loja' },
    { name: 'Configurações', description: 'Zonas de entrega, formas de pagamento e horários' },
    { name: 'Catálogo', description: 'Categorias, produtos, variações e grupos de opções' },
    { name: 'Pedidos', description: 'Pedidos recebidos pela loja' },
    { name: 'Sistema', description: 'Health check' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Token devolvido por /api/stores/login ou /register' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Dados inválidos' },
          details: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } } },
        },
      },
      City: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, state: { type: 'string', example: 'MG' }, slug: { type: 'string' } } },

      Store: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, slug: { type: 'string', example: 'pizzaria-exemplo' }, name: { type: 'string' },
          email: { type: 'string', format: 'email' }, emailVerifiedAt: { type: 'string', format: 'date-time', nullable: true },
          phone: { type: 'string' }, cityId: { type: 'integer' },
          address: {
            type: 'object',
            properties: {
              street: { type: 'string', nullable: true }, number: { type: 'string', nullable: true }, complement: { type: 'string', nullable: true },
              district: { type: 'string', nullable: true }, zipCode: { type: 'string', nullable: true },
              latitude: { type: 'number', nullable: true }, longitude: { type: 'number', nullable: true },
            },
          },
          logoUrl: { type: 'string', nullable: true }, bgColor: { type: 'string', nullable: true, example: '#B91C1C' }, textColor: { type: 'string', nullable: true, example: '#FFFFFF' },
          pixKey: { type: 'string', nullable: true }, pixBeneficiary: { type: 'string', nullable: true },
          waitMinMinutes: { type: 'integer', nullable: true }, waitMaxMinutes: { type: 'integer', nullable: true },
          active: { type: 'boolean' }, isOpen: { type: 'boolean' }, openedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      AuthResponse: { type: 'object', properties: { token: { type: 'string' }, store: ref('Store') } },
      RegisterInput: {
        type: 'object', required: ['name', 'email', 'password', 'phone', 'cityId'],
        properties: {
          name: { type: 'string', minLength: 3, maxLength: 120 }, email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 }, phone: { type: 'string' }, cityId: { type: 'integer', description: 'ID de uma cidade ativa (GET /api/cities)' },
        },
      },
      LoginInput: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } } },
      ProfileInput: {
        type: 'object', description: 'Todos os campos são opcionais; envie só o que mudou. `null` limpa o campo.',
        properties: {
          name: { type: 'string' }, phone: { type: 'string' }, cityId: { type: 'integer' },
          street: { type: 'string', nullable: true }, number: { type: 'string', nullable: true }, complement: { type: 'string', nullable: true },
          district: { type: 'string', nullable: true }, zipCode: { type: 'string', nullable: true },
          latitude: { type: 'number', nullable: true }, longitude: { type: 'number', nullable: true },
          logoUrl: { type: 'string', format: 'uri', nullable: true },
          bgColor: { type: 'string', nullable: true, example: '#B91C1C', description: 'Formato #RRGGBB' },
          textColor: { type: 'string', nullable: true, example: '#FFFFFF' },
          pixKey: { type: 'string', nullable: true }, pixBeneficiary: { type: 'string', nullable: true },
          waitMinMinutes: { type: 'integer', nullable: true, minimum: 0, maximum: 600 },
          waitMaxMinutes: { type: 'integer', nullable: true, minimum: 0, maximum: 600, description: 'Não pode ser menor que waitMinMinutes' },
        },
      },
      BusinessHour: {
        type: 'object',
        properties: { id: { type: 'integer' }, weekday: { type: 'integer', minimum: 0, maximum: 6, description: '0 = domingo … 6 = sábado' }, opensAt: { type: 'string', example: '18:00:00' }, closesAt: { type: 'string', example: '23:30:00' } },
      },
      BusinessHoursInput: {
        type: 'object', required: ['hours'],
        properties: {
          hours: {
            type: 'array', description: 'Substitui TODOS os horários atuais',
            items: { type: 'object', required: ['weekday', 'opensAt', 'closesAt'], properties: { weekday: { type: 'integer', minimum: 0, maximum: 6 }, opensAt: { type: 'string', example: '18:00' }, closesAt: { type: 'string', example: '23:30' } } },
          },
        },
      },

      DeliveryZone: { type: 'object', properties: { id: { type: 'integer' }, district: { type: 'string', example: 'Centro' }, feeCents: { type: 'integer', example: 500 }, active: { type: 'boolean' } } },
      DeliveryZoneCreate: { type: 'object', required: ['district', 'feeCents'], properties: { district: { type: 'string' }, feeCents: { type: 'integer', minimum: 0 }, active: { type: 'boolean' } } },
      DeliveryZoneUpdate: { type: 'object', properties: { district: { type: 'string' }, feeCents: { type: 'integer', minimum: 0 }, active: { type: 'boolean' } } },
      PaymentMethod: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string', example: 'Pix' }, type: { type: 'string', enum: ['CASH', 'PIX', 'CARD', 'OTHER'] }, position: { type: 'integer' }, active: { type: 'boolean' } } },
      PaymentMethodCreate: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, type: { type: 'string', enum: ['CASH', 'PIX', 'CARD', 'OTHER'] }, position: { type: 'integer' }, active: { type: 'boolean' } } },
      PaymentMethodUpdate: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string', enum: ['CASH', 'PIX', 'CARD', 'OTHER'] }, position: { type: 'integer' }, active: { type: 'boolean' } } },
      Category: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string', example: 'Pizzas' }, position: { type: 'integer' }, active: { type: 'boolean' } } },
      CategoryCreate: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, position: { type: 'integer', minimum: 0 }, active: { type: 'boolean' } } },
      CategoryUpdate: { type: 'object', properties: { name: { type: 'string' }, position: { type: 'integer', minimum: 0 }, active: { type: 'boolean' } } },

      Variant: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, productId: { type: 'integer' }, name: { type: 'string', example: 'Grande' },
          description: { type: 'string', nullable: true, example: '8 fatias' },
          priceCents: { type: 'integer', example: 0, description: 'Preço base da variação. Em produtos cujo preço vem das opções (pizza) fica 0.' },
          position: { type: 'integer' }, active: { type: 'boolean' },
        },
      },
      VariantCreate: {
        type: 'object', required: ['name', 'priceCents'],
        properties: { name: { type: 'string', maxLength: 60 }, priceCents: { type: 'integer', minimum: 0 }, description: { type: 'string', nullable: true, maxLength: 120 }, position: { type: 'integer' }, active: { type: 'boolean' } },
      },
      VariantUpdate: {
        type: 'object',
        properties: { name: { type: 'string', maxLength: 60 }, priceCents: { type: 'integer', minimum: 0 }, description: { type: 'string', nullable: true }, position: { type: 'integer' }, active: { type: 'boolean' } },
      },
      Option: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, groupId: { type: 'integer' }, name: { type: 'string', example: 'Calabresa' },
          description: { type: 'string', nullable: true }, imageUrl: { type: 'string', nullable: true },
          priceCents: { type: 'integer', description: 'Preço padrão da opção' },
          isDefault: { type: 'boolean' }, position: { type: 'integer' }, active: { type: 'boolean' },
          prices: { type: 'object', additionalProperties: { type: 'integer' }, example: { 1: 4000, 2: 5500 }, description: 'Preço por variação `{ variantId: centavos }` — sobrescreve priceCents' },
        },
      },
      OptionCreate: {
        type: 'object', required: ['name'],
        properties: {
          name: { type: 'string', maxLength: 120 }, description: { type: 'string', nullable: true }, imageUrl: { type: 'string', format: 'uri', nullable: true },
          priceCents: { type: 'integer', minimum: 0 }, isDefault: { type: 'boolean' }, position: { type: 'integer' }, active: { type: 'boolean' },
          prices: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 }, example: { 1: 4000, 2: 5500 }, description: 'Preço por variação `{ variantId: centavos }`' },
        },
      },
      OptionUpdate: {
        type: 'object',
        properties: {
          name: { type: 'string' }, description: { type: 'string', nullable: true }, imageUrl: { type: 'string', format: 'uri', nullable: true },
          priceCents: { type: 'integer', minimum: 0 }, isDefault: { type: 'boolean' }, position: { type: 'integer' }, active: { type: 'boolean' },
          prices: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
        },
      },
      OptionGroup: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, name: { type: 'string', example: 'Sabores' },
          minSelect: { type: 'integer', description: 'Mínimo de escolhas (0 = opcional)' },
          maxSelect: { type: 'integer', description: 'Máximo de escolhas' },
          maxPerOption: { type: 'integer', description: 'Quantas vezes a mesma opção pode ser repetida' },
          pricingMode: { type: 'string', enum: ['ADDITIVE', 'HIGHEST'], description: 'ADDITIVE soma as opções; HIGHEST cobra só a mais cara (meio a meio)' },
          active: { type: 'boolean' }, options: arrayOf('Option'),
        },
      },
      OptionGroupCreate: {
        type: 'object', required: ['name'],
        properties: {
          name: { type: 'string', maxLength: 80 }, minSelect: { type: 'integer', minimum: 0 }, maxSelect: { type: 'integer', minimum: 1 },
          maxPerOption: { type: 'integer', minimum: 1 }, pricingMode: { type: 'string', enum: ['ADDITIVE', 'HIGHEST'] }, active: { type: 'boolean' },
          options: { type: 'array', description: 'Opções criadas junto com o grupo', items: ref('OptionCreate') },
        },
      },
      OptionGroupUpdate: {
        type: 'object',
        properties: {
          name: { type: 'string' }, minSelect: { type: 'integer', minimum: 0 }, maxSelect: { type: 'integer', minimum: 1 },
          maxPerOption: { type: 'integer', minimum: 1 }, pricingMode: { type: 'string', enum: ['ADDITIVE', 'HIGHEST'] }, active: { type: 'boolean' },
        },
      },
      Product: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, categoryId: { type: 'integer' }, name: { type: 'string', example: 'Pizza' },
          description: { type: 'string', nullable: true }, imageUrl: { type: 'string', nullable: true },
          position: { type: 'integer' }, active: { type: 'boolean' },
          variants: arrayOf('Variant'),
          optionGroupIds: { type: 'array', items: { type: 'integer' }, description: 'IDs dos grupos de opções ligados ao produto, na ordem' },
        },
      },
      ProductCreate: {
        type: 'object', required: ['categoryId', 'name', 'variants'],
        properties: {
          categoryId: { type: 'integer' }, name: { type: 'string', maxLength: 120 }, description: { type: 'string', nullable: true, maxLength: 500 },
          imageUrl: { type: 'string', format: 'uri', nullable: true }, position: { type: 'integer' }, active: { type: 'boolean' },
          variants: { type: 'array', minItems: 1, maxItems: 20, items: ref('VariantCreate'), description: 'Produto simples usa UMA variação (ex.: "Único")' },
        },
      },
      ProductUpdate: {
        type: 'object',
        properties: {
          categoryId: { type: 'integer' }, name: { type: 'string' }, description: { type: 'string', nullable: true },
          imageUrl: { type: 'string', format: 'uri', nullable: true }, position: { type: 'integer' }, active: { type: 'boolean' },
        },
      },

      MenuOption: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, name: { type: 'string' }, description: { type: 'string', nullable: true }, imageUrl: { type: 'string', nullable: true },
          isDefault: { type: 'boolean' }, prices: { type: 'object', additionalProperties: { type: 'integer' }, description: 'Preço já resolvido por variação `{ variantId: centavos }`' },
        },
      },
      MenuOptionGroup: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, name: { type: 'string' }, minSelect: { type: 'integer' }, maxSelect: { type: 'integer' }, maxPerOption: { type: 'integer' },
          pricingMode: { type: 'string', enum: ['ADDITIVE', 'HIGHEST'] }, options: arrayOf('MenuOption'),
        },
      },
      MenuProduct: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, categoryId: { type: 'integer' }, name: { type: 'string' }, description: { type: 'string', nullable: true }, imageUrl: { type: 'string', nullable: true },
          variants: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, description: { type: 'string', nullable: true }, priceCents: { type: 'integer' } } } },
          optionGroups: arrayOf('MenuOptionGroup'),
        },
      },
      Menu: {
        type: 'object',
        properties: {
          store: {
            type: 'object',
            properties: {
              slug: { type: 'string' }, name: { type: 'string' }, phone: { type: 'string' }, logoUrl: { type: 'string', nullable: true },
              bgColor: { type: 'string', nullable: true }, textColor: { type: 'string', nullable: true }, isOpen: { type: 'boolean' },
              waitMinMinutes: { type: 'integer', nullable: true }, waitMaxMinutes: { type: 'integer', nullable: true },
              pixKey: { type: 'string', nullable: true }, pixBeneficiary: { type: 'string', nullable: true },
              address: { type: 'object', properties: { street: { type: 'string', nullable: true }, number: { type: 'string', nullable: true }, complement: { type: 'string', nullable: true }, district: { type: 'string', nullable: true } } },
              city: { type: 'string' }, state: { type: 'string' },
            },
          },
          businessHours: { type: 'array', items: { type: 'object', properties: { weekday: { type: 'integer' }, opensAt: { type: 'string' }, closesAt: { type: 'string' } } } },
          deliveryZones: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, district: { type: 'string' }, feeCents: { type: 'integer' } } } },
          paymentMethods: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, type: { type: 'string' } } } },
          categories: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, products: arrayOf('MenuProduct') } } },
        },
      },

      OrderStatus: { type: 'string', enum: ['RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PICKED_UP', 'REJECTED', 'CANCELED', 'RETURNED'] },
      OrderItemInput: {
        type: 'object', required: ['productId', 'variantId', 'quantity'],
        properties: {
          productId: { type: 'integer' }, variantId: { type: 'integer' }, quantity: { type: 'integer', minimum: 1, maximum: 99 },
          notes: { type: 'string', nullable: true, maxLength: 255 },
          options: {
            type: 'array', description: 'Opções escolhidas. `quantity` (padrão 1) é a quantidade da mesma opção, limitada por maxPerOption do grupo.',
            items: { type: 'object', required: ['groupId', 'optionId'], properties: { groupId: { type: 'integer' }, optionId: { type: 'integer' }, quantity: { type: 'integer', minimum: 1, maximum: 99 } } },
          },
        },
      },
      OrderInput: {
        type: 'object', required: ['fulfillment', 'name', 'phone', 'paymentMethodId', 'items'],
        properties: {
          fulfillment: { type: 'string', enum: ['DELIVERY', 'PICKUP'] },
          name: { type: 'string', minLength: 2, maxLength: 120 }, phone: { type: 'string', description: '10 a 13 dígitos; máscara é ignorada' },
          deliveryZoneId: { type: 'integer', description: 'Obrigatório se DELIVERY' }, address: { type: 'string', description: 'Obrigatório se DELIVERY' },
          paymentMethodId: { type: 'integer' }, cashChangeForCents: { type: 'integer', nullable: true, description: 'Troco para quanto (dinheiro)' },
          notes: { type: 'string', nullable: true, maxLength: 500 },
          items: { type: 'array', minItems: 1, maxItems: 50, items: ref('OrderItemInput') },
        },
      },
      Order: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, publicId: { type: 'string', format: 'uuid', description: 'Usado no acompanhamento público' },
          orderNumber: { type: 'integer', description: 'Sequencial por loja' }, status: ref('OrderStatus'),
          fulfillment: { type: 'string', enum: ['DELIVERY', 'PICKUP'] },
          customer: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' } } },
          delivery: { type: 'object', nullable: true, properties: { address: { type: 'string' }, district: { type: 'string' } } },
          payment: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string' }, cashChangeForCents: { type: 'integer', nullable: true } } },
          subtotalCents: { type: 'integer' }, deliveryFeeCents: { type: 'integer' }, discountCents: { type: 'integer' }, totalCents: { type: 'integer' },
          notes: { type: 'string', nullable: true }, createdAt: { type: 'string', format: 'date-time' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' }, productId: { type: 'integer', nullable: true }, productName: { type: 'string' }, variantName: { type: 'string' },
                unitPriceCents: { type: 'integer' }, optionsTotalCents: { type: 'integer' }, quantity: { type: 'integer' }, lineTotalCents: { type: 'integer' },
                notes: { type: 'string', nullable: true }, legacyDescription: { type: 'string', nullable: true },
                options: { type: 'array', items: { type: 'object', properties: { groupName: { type: 'string' }, optionName: { type: 'string' }, quantity: { type: 'integer' }, listPriceCents: { type: 'integer' }, chargedCents: { type: 'integer', description: 'Pode ser menor que o preço de tabela (ex.: meio a meio cobra só o maior)' } } } },
              },
            },
          },
          history: { type: 'array', items: { type: 'object', properties: { status: ref('OrderStatus'), reason: { type: 'string', nullable: true }, createdAt: { type: 'string', format: 'date-time' } } } },
        },
      },
      OrderPage: {
        type: 'object',
        properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, orders: arrayOf('Order') },
      },
      ChangeStatusInput: {
        type: 'object', required: ['status'],
        properties: { status: { type: 'string', enum: ['PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PICKED_UP', 'REJECTED', 'CANCELED', 'RETURNED'] }, reason: { type: 'string', nullable: true, description: 'Obrigatório para REJECTED e CANCELED' } },
      },
    },
  },

  paths: {
    '/health': { get: { tags: ['Sistema'], summary: 'Health check', responses: { 200: { description: 'OK', content: { 'text/html': { schema: { type: 'string' }, example: 'DELIVROO API V2 is healthy' } } } } } },

    // ---------------- público ----------------
    '/api/cities': {
      get: { tags: ['Público'], summary: 'Listar cidades ativas', description: 'Use o `id` no cadastro da loja.', responses: { 200: ok('Cidades', arrayOf('City')) } },
    },
    '/api/public/stores/{slug}/menu': {
      get: {
        tags: ['Público'], summary: 'Cardápio completo da loja',
        description: 'Tudo que o cliente precisa em uma chamada: loja, horários, zonas, pagamentos e categorias com produtos, variações e grupos de opções (preços já resolvidos por variação).',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' }, example: 'pizzaria-exemplo' }],
        responses: { 200: ok('Cardápio', ref('Menu')), 404: R[404] },
      },
    },
    '/api/public/stores/{slug}/orders': {
      post: {
        tags: ['Público'], summary: 'Fazer um pedido',
        description: 'O servidor recalcula todos os preços e valida as regras dos grupos (mínimo/máximo de escolhas, variação do produto, loja aberta, zona de entrega). O exemplo abaixo usa IDs da loja de exemplo — confira os IDs reais no `GET …/menu`.',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' }, example: 'pizzaria-exemplo' }],
        requestBody: body(ref('OrderInput'), orderExample),
        responses: { 201: ok('Pedido criado', ref('Order')), 400: R[400], 404: R[404], 409: errRef('Loja fechada (code STORE_CLOSED)'), 422: R[422] },
      },
    },
    '/api/public/orders/{publicId}': {
      get: {
        tags: ['Público'], summary: 'Acompanhar pedido',
        description: 'O `publicId` é um UUID aleatório devolvido ao criar o pedido. O telefone do cliente não é devolvido.',
        parameters: [{ name: 'publicId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: ok('Pedido + dados da loja', ref('Order')), 404: R[404] },
      },
    },

    // ---------------- conta ----------------
    '/api/stores/register': {
      post: {
        tags: ['Conta'], summary: 'Cadastrar loja',
        requestBody: body(ref('RegisterInput'), { name: 'Pizzaria do Zé', email: 'ze@exemplo.com', password: '123456', phone: '35999990000', cityId: 1 }),
        responses: { 201: ok('Loja criada + token', ref('AuthResponse')), 400: R[400], 409: R[409], 422: R[422] },
      },
    },
    '/api/stores/login': {
      post: {
        tags: ['Conta'], summary: 'Entrar',
        description: 'Devolve o `token` — cole-o em **Authorize** para liberar as rotas com cadeado.',
        requestBody: body(ref('LoginInput'), { email: 'loja@exemplo.com', password: '123456' }),
        responses: { 200: ok('Token + loja', ref('AuthResponse')), 400: R[400], 401: R[401], 403: errRef('Conta desativada') },
      },
    },
    '/api/stores/me': {
      get: { tags: ['Conta'], summary: 'Perfil da loja logada', security: secured, responses: { 200: ok('Loja', ref('Store')), ...authed } },
      patch: {
        tags: ['Conta'], summary: 'Atualizar perfil (parcial)', security: secured,
        requestBody: body(ref('ProfileInput'), { phone: '35988887777', waitMinMinutes: 30, waitMaxMinutes: 50, bgColor: '#B91C1C' }),
        responses: { 200: ok('Loja atualizada', ref('Store')), 400: R[400], 422: R[422], ...authed },
      },
    },
    '/api/stores/me/status': {
      patch: {
        tags: ['Conta'], summary: 'Abrir / fechar a loja',
        description: 'Ao abrir, começa um novo **turno** (`openedAt`): a listagem de pedidos padrão mostra só os pedidos desde essa abertura.',
        security: secured,
        requestBody: body({ type: 'object', required: ['isOpen'], properties: { isOpen: { type: 'boolean' } } }, { isOpen: true }),
        responses: { 200: ok('Loja atualizada', ref('Store')), 400: R[400], ...authed },
      },
    },
    '/api/stores/me/business-hours': {
      get: { tags: ['Configurações'], summary: 'Listar horários de funcionamento', security: secured, responses: { 200: ok('Horários', arrayOf('BusinessHour')), ...authed } },
      put: {
        tags: ['Configurações'], summary: 'Substituir todos os horários', security: secured,
        requestBody: body(ref('BusinessHoursInput'), { hours: [{ weekday: 5, opensAt: '18:00', closesAt: '23:30' }, { weekday: 6, opensAt: '18:00', closesAt: '23:59' }] }),
        responses: { 200: ok('Horários salvos', arrayOf('BusinessHour')), 400: R[400], 422: R[422], ...authed },
      },
    },

    // ---------------- configurações ----------------
    ...crud({ tag: 'Configurações', base: '/api/stores/delivery-zones', schema: 'DeliveryZone', createSchema: 'DeliveryZoneCreate', updateSchema: 'DeliveryZoneUpdate', createExample: { district: 'Centro', feeCents: 500 }, label: 'zonas de entrega' }),
    ...crud({ tag: 'Configurações', base: '/api/stores/payment-methods', schema: 'PaymentMethod', createSchema: 'PaymentMethodCreate', updateSchema: 'PaymentMethodUpdate', createExample: { name: 'Pix', type: 'PIX' }, label: 'formas de pagamento' }),

    // ---------------- catálogo ----------------
    ...crud({ tag: 'Catálogo', base: '/api/stores/categories', schema: 'Category', createSchema: 'CategoryCreate', updateSchema: 'CategoryUpdate', createExample: { name: 'Sobremesas', position: 4 }, label: 'categorias' }),

    '/api/stores/products': {
      get: { tags: ['Catálogo'], summary: 'Listar produtos (com variações e grupos)', security: secured, responses: { 200: ok('Produtos', arrayOf('Product')), ...authed } },
      post: {
        tags: ['Catálogo'], summary: 'Criar produto com variações',
        description: 'Produto simples: uma variação ("Único") com o preço. Produto com tamanhos: uma variação por tamanho. Depois ligue grupos de opções em `PUT /products/{id}/option-groups`.',
        security: secured,
        requestBody: body(ref('ProductCreate'), {
          categoryId: 1, name: 'X-Burger', description: 'Pão, hambúrguer e queijo',
          variants: [{ name: 'Único', priceCents: 2800 }],
        }),
        responses: { 201: ok('Produto criado', ref('Product')), 400: R[400], 422: R[422], ...authed },
      },
    },
    '/api/stores/products/{id}': {
      get: { tags: ['Catálogo'], summary: 'Detalhar produto', security: secured, parameters: [idParam()], responses: { 200: ok('Produto', ref('Product')), 404: R[404], ...authed } },
      patch: {
        tags: ['Catálogo'], summary: 'Atualizar produto (parcial)', security: secured, parameters: [idParam()],
        requestBody: body(ref('ProductUpdate'), { name: 'X-Burger Especial', active: true }),
        responses: { 200: ok('Produto', ref('Product')), 400: R[400], 404: R[404], 422: R[422], ...authed },
      },
      delete: { tags: ['Catálogo'], summary: 'Remover produto', description: 'Pedidos antigos continuam intactos (guardam cópia de nomes e preços).', security: secured, parameters: [idParam()], responses: { 204: R[204], 404: R[404], ...authed } },
    },
    '/api/stores/products/{id}/variants': {
      post: {
        tags: ['Catálogo'], summary: 'Adicionar variação ao produto', security: secured, parameters: [idParam('id', 'ID do produto')],
        requestBody: body(ref('VariantCreate'), { name: 'Família', priceCents: 0, description: '12 fatias' }),
        responses: { 201: ok('Variação criada', ref('Variant')), 400: R[400], 404: R[404], 409: R[409], ...authed },
      },
    },
    '/api/stores/products/{id}/variants/{variantId}': {
      patch: {
        tags: ['Catálogo'], summary: 'Atualizar variação', security: secured, parameters: [idParam('id', 'ID do produto'), idParam('variantId', 'ID da variação')],
        requestBody: body(ref('VariantUpdate'), { priceCents: 3000 }),
        responses: { 200: ok('Variação', ref('Variant')), 400: R[400], 404: R[404], 409: R[409], ...authed },
      },
      delete: {
        tags: ['Catálogo'], summary: 'Remover variação', security: secured, parameters: [idParam('id', 'ID do produto'), idParam('variantId', 'ID da variação')],
        responses: { 204: R[204], 404: R[404], 422: R[422], ...authed },
      },
    },
    '/api/stores/products/{id}/option-groups': {
      put: {
        tags: ['Catálogo'], summary: 'Definir quais grupos de opções o produto usa', description: 'Substitui a lista de grupos ligados ao produto, na ordem enviada.',
        security: secured, parameters: [idParam('id', 'ID do produto')],
        requestBody: body({ type: 'object', required: ['groupIds'], properties: { groupIds: { type: 'array', items: { type: 'integer' } } } }, { groupIds: [1, 2, 3] }),
        responses: { 200: ok('Produto atualizado', ref('Product')), 400: R[400], 404: R[404], 422: R[422], ...authed },
      },
    },
    '/api/stores/option-groups': {
      get: { tags: ['Catálogo'], summary: 'Listar grupos de opções (com opções)', security: secured, responses: { 200: ok('Grupos', arrayOf('OptionGroup')), ...authed } },
      post: {
        tags: ['Catálogo'], summary: 'Criar grupo de opções',
        description: 'Ex.: grupo **Borda** (min 0, max 1, ADDITIVE) ou **Sabores** (min 1, max 2, HIGHEST). Pode criar as opções na mesma chamada.',
        security: secured,
        requestBody: body(ref('OptionGroupCreate'), {
          name: 'Borda', minSelect: 0, maxSelect: 1, pricingMode: 'ADDITIVE',
          options: [{ name: 'Catupiry', priceCents: 800 }, { name: 'Cheddar', priceCents: 800 }],
        }),
        responses: { 201: ok('Grupo criado', ref('OptionGroup')), 400: R[400], 422: R[422], ...authed },
      },
    },
    '/api/stores/option-groups/{id}': {
      get: { tags: ['Catálogo'], summary: 'Detalhar grupo', security: secured, parameters: [idParam()], responses: { 200: ok('Grupo', ref('OptionGroup')), 404: R[404], ...authed } },
      patch: {
        tags: ['Catálogo'], summary: 'Atualizar grupo (parcial)', security: secured, parameters: [idParam()],
        requestBody: body(ref('OptionGroupUpdate'), { maxSelect: 3 }),
        responses: { 200: ok('Grupo', ref('OptionGroup')), 400: R[400], 404: R[404], 422: R[422], ...authed },
      },
      delete: { tags: ['Catálogo'], summary: 'Remover grupo', security: secured, parameters: [idParam()], responses: { 204: R[204], 404: R[404], 409: R[409], ...authed } },
    },
    '/api/stores/option-groups/{id}/options': {
      post: {
        tags: ['Catálogo'], summary: 'Adicionar opção ao grupo', description: 'Use `prices` para preço diferente por variação (ex.: sabor mais caro na Grande).',
        security: secured, parameters: [idParam('id', 'ID do grupo')],
        requestBody: body(ref('OptionCreate'), { name: 'Portuguesa', priceCents: 4000, prices: { 1: 4000, 2: 5500 } }),
        responses: { 201: ok('Opção criada', ref('Option')), 400: R[400], 404: R[404], 422: R[422], ...authed },
      },
    },
    '/api/stores/options/{id}': {
      patch: {
        tags: ['Catálogo'], summary: 'Atualizar opção', security: secured, parameters: [idParam('id', 'ID da opção')],
        requestBody: body(ref('OptionUpdate'), { priceCents: 4200 }),
        responses: { 200: ok('Opção', ref('Option')), 400: R[400], 404: R[404], 422: R[422], ...authed },
      },
      delete: { tags: ['Catálogo'], summary: 'Remover opção', security: secured, parameters: [idParam('id', 'ID da opção')], responses: { 204: R[204], 404: R[404], ...authed } },
    },

    // ---------------- pedidos ----------------
    '/api/stores/orders': {
      get: {
        tags: ['Pedidos'], summary: 'Listar pedidos da loja',
        description: '`scope=shift` (padrão): desde que a loja abriu (sem turno aberto, últimas 24 h). `all`: todos. `range`: exige `from` e `to`.',
        security: secured,
        parameters: [
          { name: 'scope', in: 'query', schema: { type: 'string', enum: ['shift', 'all', 'range'], default: 'shift' } },
          { name: 'status', in: 'query', schema: ref('OrderStatus') },
          { name: 'from', in: 'query', description: 'ISO 8601 (scope=range)', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', description: 'ISO 8601, exclusivo (scope=range)', schema: { type: 'string', format: 'date-time' } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
        ],
        responses: { 200: ok('Página de pedidos', ref('OrderPage')), 400: R[400], ...authed },
      },
    },
    '/api/stores/orders/{id}': {
      get: { tags: ['Pedidos'], summary: 'Detalhar pedido', security: secured, parameters: [idParam('id', 'ID do pedido')], responses: { 200: ok('Pedido', ref('Order')), 404: R[404], ...authed } },
    },
    '/api/stores/orders/{id}/status': {
      post: {
        tags: ['Pedidos'], summary: 'Mudar o status do pedido',
        description: [
          'Fluxo permitido:',
          '- `RECEIVED` → `PREPARING` | `REJECTED` | `CANCELED`',
          '- `PREPARING` → `READY` (só retirada) | `OUT_FOR_DELIVERY` (só entrega) | `CANCELED`',
          '- `READY` → `PICKED_UP` | `CANCELED`',
          '- `OUT_FOR_DELIVERY` → `DELIVERED` | `RETURNED` | `CANCELED`',
          '',
          '`REJECTED` e `CANCELED` exigem `reason`. A resposta traz também `message`: o texto-modelo (WhatsApp) configurado para aquele status, ou `null`.',
        ].join('\n'),
        security: secured, parameters: [idParam('id', 'ID do pedido')],
        requestBody: body(ref('ChangeStatusInput'), { status: 'PREPARING' }),
        responses: {
          200: ok('Pedido atualizado', { type: 'object', properties: { order: ref('Order'), message: { type: 'string', nullable: true } } }),
          400: R[400], 404: R[404], 409: R[409], 422: R[422], ...authed,
        },
      },
    },
  },
};
