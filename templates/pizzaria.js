import { BEBIDAS, PIZZA_SIZES, SABOR_REFRI, SABOR_SUCO, single } from './helpers.js';

// Preços de exemplo (em centavos): o dono da loja deve revisá-los antes de abrir.
export default {
  key: 'pizzaria',
  name: 'Pizzaria',
  description: 'Pizzas Broto/Grande com até 2 sabores, borda recheada, adicionais, porções, bebidas e sobremesas.',

  groups: {
    saboresTradicionais: {
      name: 'Sabores tradicionais', min: 1, max: 2, mode: 'HIGHEST', // meio a meio: cobra só o mais caro
      options: [
        ['Mussarela', 'Mussarela e orégano', { Broto: 3800, Grande: 5800 }],
        ['Calabresa', 'Calabresa fatiada, cebola e mussarela', { Broto: 4000, Grande: 6000 }],
        ['Portuguesa', 'Presunto, ovo, cebola, ervilha e mussarela', { Broto: 4400, Grande: 6600 }],
        ['Frango com Catupiry', 'Frango desfiado e catupiry original', { Broto: 4600, Grande: 6800 }],
        ['Margherita', 'Mussarela, tomate fatiado, manjericão e parmesão', { Broto: 4200, Grande: 6200 }],
        ['Bacon', 'Bacon crocante, mussarela e cebola', { Broto: 4600, Grande: 6800 }],
      ],
    },
    saboresEspeciais: {
      name: 'Sabores especiais', min: 1, max: 2, mode: 'HIGHEST',
      options: [
        ['Quatro Queijos', 'Mussarela, provolone, parmesão e gorgonzola', { Broto: 4800, Grande: 7200 }],
        ['Lombo com Cheddar', 'Lombo canadense, cheddar cremoso e cebola', { Broto: 4800, Grande: 7200 }],
        ['Pepperoni', 'Pepperoni importado e mussarela', { Broto: 5200, Grande: 7600 }],
        ['Carne Seca com Catupiry', 'Carne seca desfiada, catupiry e cebola roxa', { Broto: 5400, Grande: 7900 }],
      ],
    },
    saboresDoces: {
      name: 'Sabores doces', min: 1, max: 2, mode: 'HIGHEST',
      options: [
        ['Chocolate', 'Chocolate ao leite derretido', { Broto: 4200, Grande: 6200 }],
        ['Banana com Canela', 'Banana fatiada, açúcar e canela', { Broto: 4000, Grande: 6000 }],
        ['Romeu e Julieta', 'Mussarela e goiabada', { Broto: 4400, Grande: 6400 }],
        ['Prestígio', 'Chocolate e coco ralado', { Broto: 4600, Grande: 6600 }],
      ],
    },
    borda: {
      name: 'Borda recheada', min: 0, max: 1, mode: 'ADDITIVE',
      options: [
        ['Catupiry', null, { Broto: 800, Grande: 1200 }],
        ['Cheddar', null, { Broto: 800, Grande: 1200 }],
        ['Mussarela', null, { Broto: 700, Grande: 1100 }],
      ],
    },
    adicionaisPizza: {
      name: 'Adicionais da pizza', min: 0, max: 4, mode: 'ADDITIVE',
      options: [
        ['Bacon', null, { Broto: 500, Grande: 800 }],
        ['Cebola', null, { Broto: 300, Grande: 500 }],
        ['Azeitona', null, { Broto: 300, Grande: 500 }],
        ['Milho', null, { Broto: 300, Grande: 500 }],
      ],
    },
    recheioCalzone: {
      name: 'Recheio do calzone', min: 1, max: 1, mode: 'ADDITIVE',
      options: [
        ['Calabresa', 'Calabresa, cebola e mussarela', 0],
        ['Frango com Catupiry', null, 0],
        ['Presunto e Queijo', null, 0],
      ],
    },
    saborRefri: SABOR_REFRI,
    saborSuco: SABOR_SUCO,
  },

  catalog: [
    {
      category: 'Pizzas',
      products: [
        { name: 'Pizza Tradicional', description: 'Escolha o tamanho, até 2 sabores e a borda.', variants: PIZZA_SIZES, groups: ['saboresTradicionais', 'borda', 'adicionaisPizza'] },
        { name: 'Pizza Especial', description: 'Sabores especiais, até 2 por pizza.', variants: PIZZA_SIZES, groups: ['saboresEspeciais', 'borda', 'adicionaisPizza'] },
        { name: 'Pizza Doce', description: 'Para fechar a noite: até 2 sabores doces.', variants: PIZZA_SIZES, groups: ['saboresDoces'] },
        { name: 'Calzone', description: 'Massa de pizza dobrada e recheada.', variants: single(3600, '1 pessoa'), groups: ['recheioCalzone'] },
      ],
    },
    {
      category: 'Porções',
      products: [
        { name: 'Batata Frita', description: 'Batata frita sequinha e crocante.', variants: [{ name: 'Média', description: 'serve 2 pessoas', price: 2200 }, { name: 'Grande', description: 'serve 4 pessoas', price: 3200 }], groups: [] },
        { name: 'Calabresa Acebolada', description: 'Calabresa artesanal com cebola.', variants: [{ name: 'Meia', description: 'serve 2 pessoas', price: 2800 }, { name: 'Inteira', description: 'serve 4 pessoas', price: 4600 }], groups: [] },
      ],
    },
    {
      category: 'Bebidas',
      products: [
        ...BEBIDAS,
        { name: 'Cerveja Long Neck', description: '355 ml, bem gelada.', variants: single(1000), groups: [] },
      ],
    },
    {
      category: 'Sobremesas',
      products: [
        { name: 'Pudim de Leite', description: 'Pudim caseiro com calda de caramelo.', variants: single(1400), groups: [] },
        { name: 'Brownie com Sorvete', description: 'Brownie quentinho com uma bola de sorvete.', variants: single(2000), groups: [] },
        { name: 'Torta de Limão', description: 'Fatia de torta com merengue.', variants: single(1500), groups: [] },
      ],
    },
  ],
};
