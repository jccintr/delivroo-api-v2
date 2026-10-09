// Loja de demonstração COMPLETA (Pizzaria Exemplo) para desenvolver e testar o front do cliente.
//   login do painel: loja@exemplo.com / 123456      cardápio público: GET /api/public/stores/pizzaria-exemplo/menu
//
// Usada por `npm run seed:demo` e por `npm run migrate:fresh:seed`. Só use em banco de desenvolvimento.
// Dinheiro em centavos. Preço de opção como objeto { Broto: 800, Grande: 1200 } = preço por variação (pelo NOME da variação).
// As imagens ficam vazias de propósito: envie pelas rotas de upload (PATCH .../image) ou pelo painel.
import bcryptjs from 'bcryptjs';
import { applyCatalog } from '../services/template.service.js';

export const DEMO = { slug: 'pizzaria-modelo', email: 'pizzaria@gmail.com', password: '123456' };

// ------------------------------------------------------------------------------------------------
// Grupos de opções (reutilizáveis entre produtos)
// ------------------------------------------------------------------------------------------------
const GROUPS = {
  saboresTradicionais: {
    name: 'Sabores tradicionais', min: 1, max: 2, mode: 'HIGHEST', // meio a meio: cobra só o mais caro
    options: [
      ['Mussarela', 'Mussarela e orégano', { Broto: 3800, Grande: 5800 }],
      ['Calabresa', 'Calabresa fatiada, cebola e mussarela', { Broto: 4000, Grande: 6000 }],
      ['Portuguesa', 'Presunto, ovo, cebola, ervilha e mussarela', { Broto: 4400, Grande: 6600 }],
      ['Margherita', 'Mussarela, tomate fatiado, manjericão e parmesão', { Broto: 4200, Grande: 6200 }],
      ['Napolitana', 'Mussarela, tomate, parmesão e orégano', { Broto: 4200, Grande: 6200 }],
      ['Frango com Catupiry', 'Frango desfiado e catupiry original', { Broto: 4600, Grande: 6800 }],
      ['Bacon', 'Bacon crocante, mussarela e cebola', { Broto: 4600, Grande: 6800 }],
    ],
  },
  saboresEspeciais: {
    name: 'Sabores especiais', min: 1, max: 2, mode: 'HIGHEST',
    options: [
      ['Quatro Queijos', 'Mussarela, provolone, parmesão e gorgonzola', { Broto: 4800, Grande: 7200 }],
      ['Lombo com Cheddar', 'Lombo canadense, cheddar cremoso e cebola', { Broto: 4800, Grande: 7200 }],
      ['Atum', 'Atum sólido, cebola e mussarela', { Broto: 4800, Grande: 7000 }],
      ['Pepperoni', 'Pepperoni importado e mussarela', { Broto: 5200, Grande: 7600 }],
      ['Carne Seca com Catupiry', 'Carne seca desfiada, catupiry e cebola roxa', { Broto: 5400, Grande: 7900 }],
      ['Camarão', 'Camarão refogado, catupiry e salsinha', { Broto: 6200, Grande: 9200 }],
    ],
  },
  saboresDoces: {
    name: 'Sabores doces', min: 1, max: 2, mode: 'HIGHEST',
    options: [
      ['Chocolate', 'Chocolate ao leite derretido', { Broto: 4200, Grande: 6200 }],
      ['Banana com Canela', 'Banana fatiada, açúcar e canela', { Broto: 4000, Grande: 6000 }],
      ['Romeu e Julieta', 'Mussarela e goiabada', { Broto: 4400, Grande: 6400 }],
      ['Prestígio', 'Chocolate e coco ralado', { Broto: 4600, Grande: 6600 }],
      ['Doce de Leite com Coco', 'Doce de leite e coco ralado', { Broto: 4600, Grande: 6600 }],
      ['Morango com Chocolate', 'Morangos frescos e chocolate', { Broto: 4800, Grande: 7000 }],
      ['M&M\'s', 'Chocolate ao leite e confeitos M&M\'s', { Broto: 5000, Grande: 7400 }],
    ],
  },
  borda: {
    name: 'Borda recheada', min: 0, max: 1, mode: 'ADDITIVE',
    options: [
      ['Catupiry', null, { Broto: 800, Grande: 1200 }],
      ['Cheddar', null, { Broto: 800, Grande: 1200 }],
      ['Cream Cheese', null, { Broto: 900, Grande: 1300 }],
      ['Mussarela', null, { Broto: 700, Grande: 1100 }],
    ],
  },
  bordaDoce: {
    name: 'Borda doce', min: 0, max: 1, mode: 'ADDITIVE',
    options: [
      ['Chocolate', null, { Broto: 900, Grande: 1300 }],
      ['Doce de Leite', null, { Broto: 900, Grande: 1300 }],
      ['Goiabada', null, { Broto: 800, Grande: 1200 }],
    ],
  },
  adicionaisPizza: {
    name: 'Adicionais da pizza', min: 0, max: 5, mode: 'ADDITIVE',
    options: [
      ['Bacon', null, { Broto: 500, Grande: 800 }],
      ['Catupiry', null, { Broto: 600, Grande: 900 }],
      ['Cebola', null, { Broto: 300, Grande: 500 }],
      ['Azeitona', null, { Broto: 300, Grande: 500 }],
      ['Ovo', null, { Broto: 300, Grande: 500 }],
      ['Milho', null, { Broto: 300, Grande: 500 }],
    ],
  },
  recheioCalzone: {
    name: 'Recheio do calzone', min: 1, max: 1, mode: 'ADDITIVE',
    options: [
      ['Calabresa', 'Calabresa, cebola e mussarela', 0],
      ['Frango com Catupiry', null, 0],
      ['Presunto e Queijo', null, 0],
      ['Chocolate', 'Calzone doce de chocolate', 0],
    ],
  },
  pontoCarne: {
    name: 'Ponto da carne', min: 1, max: 1, mode: 'ADDITIVE',
    options: [['Mal passado', null, 0], ['Ao ponto', null, 0, true], ['Bem passado', null, 0]],
  },
  adicionaisLanche: {
    name: 'Adicionais do lanche', min: 0, max: 6, perOption: 2, mode: 'ADDITIVE', // até 2x a mesma opção
    options: [
      ['Bacon extra', null, 500],
      ['Cheddar extra', null, 400],
      ['Queijo extra', null, 400],
      ['Ovo', null, 300],
      ['Hambúrguer extra', 'Mais um blend de 160 g', 800],
      ['Maionese da casa', null, 200],
    ],
  },
  molhos: {
    name: 'Molhos extras', min: 0, max: 3, mode: 'ADDITIVE',
    options: [
      ['Maionese temperada', null, 200],
      ['Barbecue', null, 250],
      ['Cheddar cremoso', null, 300],
      ['Molho verde', null, 200],
      ['Geleia de pimenta', null, 300],
    ],
  },
  saborRefri: {
    name: 'Sabor do refrigerante', min: 1, max: 1, mode: 'ADDITIVE',
    options: [['Coca-Cola', null, 0], ['Coca-Cola Zero', null, 0], ['Guaraná Antarctica', null, 0], ['Fanta Laranja', null, 0], ['Sprite', null, 0]],
  },
  saborSuco: {
    name: 'Sabor do suco', min: 1, max: 1, mode: 'ADDITIVE',
    options: [['Laranja', null, 0], ['Limão', null, 0], ['Maracujá', null, 0], ['Abacaxi com Hortelã', null, 0], ['Morango', null, 0]],
  },
  cervejaLongNeck: {
    name: 'Marca da long neck', min: 1, max: 1, mode: 'ADDITIVE', // o preço vem da marca (variação "Único" custa 0)
    options: [['Budweiser', null, 900], ['Stella Artois', null, 1000], ['Heineken', null, 1100], ['Corona', null, 1200]],
  },
  cerveja600: {
    name: 'Marca da cerveja 600 ml', min: 1, max: 1, mode: 'ADDITIVE',
    options: [['Skol', null, 1200], ['Brahma', null, 1200], ['Antarctica', null, 1200], ['Heineken', null, 1800]],
  },
  saborPizzaCombo: {
    name: 'Sabor da pizza do combo', min: 1, max: 1, mode: 'ADDITIVE', // um sabor; os especiais têm acréscimo
    options: [
      ['Mussarela', null, 0], ['Calabresa', null, 0], ['Portuguesa', null, 0], ['Frango com Catupiry', null, 0],
      ['Margherita', null, 0], ['Quatro Queijos', null, 500], ['Pepperoni', null, 700],
    ],
  },
  calda: {
    name: 'Calda', min: 0, max: 1, mode: 'ADDITIVE',
    options: [['Chocolate', null, 0], ['Doce de leite', null, 0], ['Morango', null, 0]],
  },
  saborSorvete: {
    name: 'Sabor do sorvete', min: 1, max: 1, mode: 'ADDITIVE',
    options: [['Creme', null, 0], ['Chocolate', null, 0], ['Morango', null, 0]],
  },
  bolasTaca: {
    name: 'Bolas da taça (até 3)', min: 1, max: 3, perOption: 3, mode: 'ADDITIVE', // pode repetir o mesmo sabor
    options: [['Creme', null, 0], ['Chocolate', null, 0], ['Morango', null, 0], ['Flocos', null, 0], ['Napolitano', null, 0]],
  },
};

// ------------------------------------------------------------------------------------------------
// Catálogo: categoria -> produtos (variações + grupos de opções)
// ------------------------------------------------------------------------------------------------
const PIZZA_SIZES = [
  { name: 'Broto', description: '4 fatias · 25 cm', price: 0 },
  { name: 'Grande', description: '8 fatias · 35 cm', price: 0 },
];
const U = (price, description = null) => [{ name: 'Único', description, price }];

const CATALOG = [
  {
    category: 'Pizzas',
    products: [
      { name: 'Pizza Tradicional', description: 'Escolha o tamanho, até 2 sabores e a borda.', variants: PIZZA_SIZES, groups: ['saboresTradicionais', 'borda', 'adicionaisPizza'] },
      { name: 'Pizza Especial', description: 'Sabores especiais, até 2 por pizza.', variants: PIZZA_SIZES, groups: ['saboresEspeciais', 'borda', 'adicionaisPizza'] },
      { name: 'Pizza Doce', description: 'Para fechar a noite: até 2 sabores doces.', variants: PIZZA_SIZES, groups: ['saboresDoces', 'bordaDoce'] },
      { name: 'Calzone', description: 'Massa de pizza dobrada e recheada, assada no forno a lenha.', variants: U(3600, '1 pessoa'), groups: ['recheioCalzone', 'molhos'] },
    ],
  },
  {
    category: 'Hambúrgueres',
    products: [
      { name: 'X-Burger', description: 'Pão brioche, blend 160 g, queijo prato e maionese da casa.', variants: U(2400), groups: ['pontoCarne', 'adicionaisLanche'] },
      { name: 'X-Salada', description: 'Pão brioche, blend 160 g, queijo, alface, tomate e maionese.', variants: U(2700), groups: ['pontoCarne', 'adicionaisLanche'] },
      { name: 'X-Bacon', description: 'Pão brioche, blend 160 g, queijo, bacon crocante e maionese.', variants: U(3200), groups: ['pontoCarne', 'adicionaisLanche'] },
      { name: 'X-Egg', description: 'Pão brioche, blend 160 g, queijo, ovo e maionese.', variants: U(2900), groups: ['pontoCarne', 'adicionaisLanche'] },
      { name: 'X-Tudo', description: 'Blend 160 g, queijo, bacon, ovo, presunto, alface, tomate e maionese.', variants: U(3800), groups: ['pontoCarne', 'adicionaisLanche'] },
      { name: 'Duplo Cheddar', description: 'Dois blends de 160 g, cheddar cremoso, bacon e cebola caramelizada.', variants: U(3600), groups: ['pontoCarne', 'adicionaisLanche'] },
      { name: 'Frango Crispy', description: 'Frango empanado crocante, queijo, alface e maionese de ervas.', variants: U(3000), groups: ['adicionaisLanche'] },
      { name: 'Veggie', description: 'Hambúrguer de grão-de-bico, queijo, rúcula, tomate e maionese verde.', variants: U(3200), groups: ['adicionaisLanche'] },
    ],
  },
  {
    category: 'Combos',
    products: [
      { name: 'Combo X-Bacon', description: 'X-Bacon + batata frita média + refrigerante lata.', variants: U(5200, '1 pessoa'), groups: ['pontoCarne', 'saborRefri'] },
      { name: 'Combo Duplo Cheddar', description: 'Duplo Cheddar + batata frita média + refrigerante lata.', variants: U(5600, '1 pessoa'), groups: ['pontoCarne', 'saborRefri'] },
      { name: 'Combo Frango Crispy', description: 'Frango Crispy + batata frita média + refrigerante lata.', variants: U(4600, '1 pessoa'), groups: ['saborRefri'] },
      { name: 'Combo Pizza Grande + Refri 2 L', description: 'Uma pizza grande de 1 sabor + refrigerante 2 litros.', variants: U(7900, 'serve 3 pessoas'), groups: ['saborPizzaCombo', 'saborRefri'] },
    ],
  },
  {
    category: 'Porções',
    products: [
      { name: 'Batata Frita', description: 'Batata frita sequinha e crocante.', variants: [{ name: 'Média', description: 'serve 2 pessoas', price: 2200 }, { name: 'Grande', description: 'serve 4 pessoas', price: 3200 }], groups: ['molhos'] },
      { name: 'Batata com Cheddar e Bacon', description: 'Batata frita coberta com cheddar cremoso e bacon.', variants: [{ name: 'Média', description: 'serve 2 pessoas', price: 3400 }, { name: 'Grande', description: 'serve 4 pessoas', price: 4800 }], groups: ['molhos'] },
      { name: 'Onion Rings', description: 'Anéis de cebola empanados.', variants: U(2600, 'serve 2 pessoas'), groups: ['molhos'] },
      { name: 'Frango a Passarinho', description: 'Frango frito temperado com alho e salsinha.', variants: [{ name: 'Meia', description: 'serve 2 pessoas', price: 3800 }, { name: 'Inteira', description: 'serve 4 pessoas', price: 6200 }], groups: ['molhos'] },
      { name: 'Calabresa Acebolada', description: 'Calabresa artesanal com cebola.', variants: [{ name: 'Meia', description: 'serve 2 pessoas', price: 2800 }, { name: 'Inteira', description: 'serve 4 pessoas', price: 4600 }], groups: ['molhos'] },
      { name: 'Isca de Tilápia', description: 'Iscas de tilápia empanadas com molho tártaro.', variants: [{ name: 'Meia', description: 'serve 2 pessoas', price: 4200 }, { name: 'Inteira', description: 'serve 4 pessoas', price: 6800 }], groups: ['molhos'] },
      { name: 'Mandioca Frita', description: 'Mandioca frita com sal e alho.', variants: U(2400, 'serve 2 pessoas'), groups: ['molhos'] },
      { name: 'Polenta Frita', description: 'Palitos de polenta com parmesão.', variants: U(2400, 'serve 2 pessoas'), groups: ['molhos'] },
    ],
  },
  {
    category: 'Bebidas',
    products: [
      { name: 'Refrigerante', description: 'Gelado, escolha o sabor.', variants: [{ name: 'Lata 350 ml', price: 600 }, { name: '600 ml', price: 900 }, { name: '2 L', price: 1400 }], groups: ['saborRefri'] },
      { name: 'Suco Natural', description: 'Feito na hora, com fruta de verdade.', variants: [{ name: '300 ml', price: 900 }, { name: '500 ml', price: 1300 }], groups: ['saborSuco'] },
      { name: 'Água Mineral', description: null, variants: [{ name: 'Sem gás', description: '500 ml', price: 400 }, { name: 'Com gás', description: '500 ml', price: 450 }], groups: [] },
      { name: 'Água de Coco', description: 'Caixinha 330 ml.', variants: U(700), groups: [] },
      { name: 'Cerveja Long Neck', description: '355 ml, bem gelada.', variants: U(0), groups: ['cervejaLongNeck'] },
      { name: 'Cerveja 600 ml', description: 'Garrafa para dividir.', variants: U(0), groups: ['cerveja600'] },
      { name: 'Energético', description: 'Lata 250 ml.', variants: U(1800), groups: [] },
    ],
  },
  {
    category: 'Sobremesas',
    products: [
      { name: 'Brownie com Sorvete', description: 'Brownie quentinho com uma bola de sorvete.', variants: U(2000), groups: ['saborSorvete', 'calda'] },
      { name: 'Petit Gâteau', description: 'Bolo de chocolate com centro cremoso e sorvete.', variants: U(2400), groups: ['saborSorvete', 'calda'] },
      { name: 'Taça de Sorvete', description: 'Monte sua taça com até 3 bolas.', variants: U(1600), groups: ['bolasTaca', 'calda'] },
      { name: 'Pudim de Leite', description: 'Pudim caseiro com calda de caramelo.', variants: U(1400), groups: [] },
      { name: 'Mousse de Maracujá', description: 'Mousse aerado com calda da fruta.', variants: U(1300), groups: [] },
      { name: 'Torta de Limão', description: 'Fatia de torta com merengue.', variants: U(1500), groups: [] },
    ],
  },
];

const CITIES = [
  ['Pouso Alegre', 'MG'],['Brazópolis', 'MG'], ['Itajubá', 'MG'], ['Poços de Caldas', 'MG'], ['Varginha', 'MG'], ['Belo Horizonte', 'MG'], ['Campinas', 'SP'],
];
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const ZONES = [['Centro', 500], ['Foch', 600], ['Primavera', 600], ['São Geraldo', 700], ['Faisqueira', 800], ['São Cristóvão', 800], ['Jardim Içara', 900], ['Cidade Jardim', 900], ['Santa Rita', 1000]];

const PAYMENTS = [['Pix', 'PIX'], ['Dinheiro', 'CASH'], ['Cartão de débito', 'CARD'], ['Cartão de crédito', 'CARD']];

// terça a domingo: jantar; sábado e domingo também almoço (0 = domingo)
const HOURS = [
  [2, '18:00', '23:30'], [3, '18:00', '23:30'], [4, '18:00', '23:30'], [5, '18:00', '23:59'],
  [6, '11:30', '14:30'], [6, '18:00', '23:59'], [0, '11:30', '14:30'], [0, '18:00', '23:30'],
];

const MESSAGES = {
  PREPARING: 'Olá! Recebemos o seu pedido e já estamos preparando. 🍕',
  READY: 'Seu pedido está pronto para retirada! Pode vir buscar. 😊',
  OUT_FOR_DELIVERY: 'Seu pedido saiu para entrega! Já já chega aí. 🛵',
  DELIVERED: 'Pedido entregue! Bom apetite e obrigado pela preferência. ❤️',
  PICKED_UP: 'Pedido retirado! Bom apetite e obrigado pela preferência. ❤️',
  REJECTED: 'Sentimos muito, não conseguimos aceitar o seu pedido agora.',
  CANCELED: 'Seu pedido foi cancelado. Qualquer dúvida, é só chamar.',
  RETURNED: 'Não conseguimos entregar o seu pedido. Entre em contato conosco.',
};

// ------------------------------------------------------------------------------------------------
export async function seedDemo(db) {
  const passwordHash = await bcryptjs.hash(DEMO.password, 10);

  return db.transaction(async (trx) => {
    // cidades (as que já existirem são aproveitadas)
    for (const [name, state] of CITIES) {
      const slug = `${slugify(name)}-${state.toLowerCase()}`;
      if (!(await trx('cities').where({ slug }).first('id'))) await trx('cities').insert({ name, state, slug });
    }
    const city = await trx('cities').where({ slug: 'pouso-alegre-mg' }).first('id');

    const [storeId] = await trx('stores').insert({
      slug: DEMO.slug, name: 'Pizzaria Exemplo', email: DEMO.email, password_hash: passwordHash,
      email_verified_at: new Date(), phone: '35999999999', city_id: city.id,
      street: 'Rua das Palmeiras', number: '123', district: 'Centro', zip_code: '37550-000',
      latitude: -22.23, longitude: -45.9363,
      bg_color: '#B91C1C', text_color: '#FFFFFF',
      pix_key: '35999999999', pix_beneficiary: 'Pizzaria Exemplo LTDA',
      wait_min_minutes: 40, wait_max_minutes: 60,
      is_open: true, opened_at: new Date(),
    });

    await trx('delivery_zones').insert(ZONES.map(([district, fee]) => ({ store_id: storeId, district, fee_cents: fee })));
    await trx('payment_methods').insert(PAYMENTS.map(([name, type], i) => ({ store_id: storeId, name, type, position: i + 1 })));
    await trx('business_hours').insert(HOURS.map(([weekday, o, c]) => ({ store_id: storeId, weekday, opens_at: `${o}:00`, closes_at: `${c}:00` })));
    await trx('store_message_templates').insert(Object.entries(MESSAGES).map(([status, body]) => ({ store_id: storeId, status, body })));

    // grupos, categorias, produtos, variações e preços por variação (mesma rotina dos templates do cadastro)
    const catalog = await applyCatalog(trx, storeId, { groups: GROUPS, catalog: CATALOG });

    return {
      storeId,
      categories: catalog.categories,
      products: catalog.products,
      groups: catalog.groups,
    };
  });
}
