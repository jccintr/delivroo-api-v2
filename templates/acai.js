import { SABOR_REFRI, SABOR_SUCO, single } from './helpers.js';

const COPOS = (a, b, c) => [
  { name: '300 ml', price: a },
  { name: '500 ml', price: b },
  { name: '700 ml', price: c },
];

// Preços de exemplo (em centavos): o dono da loja deve revisá-los antes de abrir.
export default {
  key: 'acai',
  name: 'Açaí',
  description: 'Açaí no copo em 3 tamanhos com complementos, coberturas e adicionais, tigelas, combo e bebidas.',

  groups: {
    complementos: {
      name: 'Complementos (até 3)', min: 0, max: 3, mode: 'ADDITIVE',
      options: [
        ['Granola', null, 0], ['Leite em pó', null, 0], ['Paçoca', null, 0], ['Banana', null, 0],
        ['Morango', null, 0], ['Amendoim', null, 0], ['Coco ralado', null, 0], ['Chocolate granulado', null, 0],
      ],
    },
    coberturas: {
      name: 'Cobertura', min: 0, max: 1, mode: 'ADDITIVE',
      options: [['Leite condensado', null, 0], ['Calda de chocolate', null, 0], ['Calda de morango', null, 0], ['Doce de leite', null, 0]],
    },
    adicionaisAcai: {
      name: 'Adicionais', min: 0, max: 5, perOption: 2, mode: 'ADDITIVE', // até 2x o mesmo adicional
      options: [
        ['Creme de ninho', null, 400], ['Creme de avelã', null, 600], ['Pasta de amendoim', null, 400],
        ['Morango extra', null, 300], ['Banana extra', null, 200], ['Granola extra', null, 200],
      ],
    },
    saborShakeAcai: {
      name: 'Sabor do shake', min: 1, max: 1, mode: 'ADDITIVE',
      options: [['Açaí com banana', null, 0], ['Açaí com morango', null, 0]],
    },
    saborRefri: SABOR_REFRI,
    saborSuco: SABOR_SUCO,
  },

  catalog: [
    {
      category: 'Açaí no copo',
      products: [
        { name: 'Açaí Tradicional', description: 'Açaí batido e cremoso. Monte do seu jeito.', variants: COPOS(1400, 1900, 2500), groups: ['complementos', 'coberturas', 'adicionaisAcai'] },
        { name: 'Açaí com Morango', description: 'Açaí batido com morango. Monte do seu jeito.', variants: COPOS(1600, 2100, 2700), groups: ['complementos', 'coberturas', 'adicionaisAcai'] },
        { name: 'Açaí Zero', description: 'Sem adição de açúcar.', variants: COPOS(1600, 2100, 2700), groups: ['complementos', 'coberturas', 'adicionaisAcai'] },
      ],
    },
    {
      category: 'Tigelas',
      products: [
        { name: 'Tigela Tropical', description: 'Açaí com banana, morango, granola e mel.', variants: [{ name: '500 ml', price: 2800 }, { name: '700 ml', price: 3600 }], groups: ['coberturas', 'adicionaisAcai'] },
        { name: 'Tigela Fit', description: 'Açaí zero com frutas, granola e pasta de amendoim.', variants: [{ name: '500 ml', price: 3000 }, { name: '700 ml', price: 3800 }], groups: ['adicionaisAcai'] },
      ],
    },
    {
      category: 'Combos',
      products: [
        { name: 'Combo Casal', description: 'Dois açaís de 500 ml com os mesmos complementos e cobertura.', variants: single(3600, 'serve 2 pessoas'), groups: ['complementos', 'coberturas'] },
      ],
    },
    {
      category: 'Bebidas',
      products: [
        { name: 'Shake de Açaí', description: 'Açaí batido com leite e sorvete.', variants: [{ name: '300 ml', price: 1600 }, { name: '500 ml', price: 2200 }], groups: ['saborShakeAcai'] },
        { name: 'Refrigerante', description: 'Lata gelada, escolha o sabor.', variants: [{ name: 'Lata 350 ml', price: 600 }], groups: ['saborRefri'] },
        { name: 'Suco Natural', description: 'Feito na hora, com fruta de verdade.', variants: [{ name: '300 ml', price: 900 }, { name: '500 ml', price: 1300 }], groups: ['saborSuco'] },
        { name: 'Água Mineral', description: null, variants: [{ name: 'Sem gás', description: '500 ml', price: 400 }], groups: [] },
      ],
    },
  ],
};
