import { BEBIDAS, SABOR_REFRI, SABOR_SUCO, single } from './helpers.js';

// Preços de exemplo (em centavos): o dono da loja deve revisá-los antes de abrir.
export default {
  key: 'hamburgueria',
  name: 'Hamburgueria',
  description: 'Hambúrgueres com ponto da carne e adicionais, combos, porções, milk-shakes e bebidas.',

  groups: {
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
      ],
    },
    molhos: {
      name: 'Molhos extras', min: 0, max: 3, mode: 'ADDITIVE',
      options: [
        ['Maionese temperada', null, 200],
        ['Barbecue', null, 250],
        ['Cheddar cremoso', null, 300],
        ['Molho verde', null, 200],
      ],
    },
    saborShake: {
      name: 'Sabor do milk-shake', min: 1, max: 1, mode: 'ADDITIVE',
      options: [['Chocolate', null, 0], ['Morango', null, 0], ['Creme', null, 0]],
    },
    saborRefri: SABOR_REFRI,
    saborSuco: SABOR_SUCO,
  },

  catalog: [
    {
      category: 'Hambúrgueres',
      products: [
        { name: 'X-Burger', description: 'Pão brioche, blend 160 g, queijo prato e maionese da casa.', variants: single(2400), groups: ['pontoCarne', 'adicionaisLanche'] },
        { name: 'X-Salada', description: 'Pão brioche, blend 160 g, queijo, alface, tomate e maionese.', variants: single(2700), groups: ['pontoCarne', 'adicionaisLanche'] },
        { name: 'X-Bacon', description: 'Pão brioche, blend 160 g, queijo, bacon crocante e maionese.', variants: single(3200), groups: ['pontoCarne', 'adicionaisLanche'] },
        { name: 'X-Egg', description: 'Pão brioche, blend 160 g, queijo, ovo e maionese.', variants: single(2900), groups: ['pontoCarne', 'adicionaisLanche'] },
        { name: 'X-Tudo', description: 'Blend 160 g, queijo, bacon, ovo, presunto, alface, tomate e maionese.', variants: single(3800), groups: ['pontoCarne', 'adicionaisLanche'] },
        { name: 'Duplo Cheddar', description: 'Dois blends de 160 g, cheddar cremoso, bacon e cebola caramelizada.', variants: single(3600), groups: ['pontoCarne', 'adicionaisLanche'] },
        { name: 'Frango Crispy', description: 'Frango empanado crocante, queijo, alface e maionese de ervas.', variants: single(3000), groups: ['adicionaisLanche'] },
        { name: 'Veggie', description: 'Hambúrguer de grão-de-bico, queijo, rúcula, tomate e maionese verde.', variants: single(3200), groups: ['adicionaisLanche'] },
      ],
    },
    {
      category: 'Combos',
      products: [
        { name: 'Combo X-Bacon', description: 'X-Bacon + batata frita média + refrigerante lata.', variants: single(5200, '1 pessoa'), groups: ['pontoCarne', 'saborRefri'] },
        { name: 'Combo Frango Crispy', description: 'Frango Crispy + batata frita média + refrigerante lata.', variants: single(4600, '1 pessoa'), groups: ['saborRefri'] },
      ],
    },
    {
      category: 'Porções',
      products: [
        { name: 'Batata Frita', description: 'Batata frita sequinha e crocante.', variants: [{ name: 'Média', description: 'serve 2 pessoas', price: 2200 }, { name: 'Grande', description: 'serve 4 pessoas', price: 3200 }], groups: ['molhos'] },
        { name: 'Onion Rings', description: 'Anéis de cebola empanados.', variants: single(2600, 'serve 2 pessoas'), groups: ['molhos'] },
      ],
    },
    {
      category: 'Bebidas',
      products: [
        ...BEBIDAS,
        { name: 'Milk-shake', description: 'Cremoso, feito na hora.', variants: [{ name: '300 ml', price: 1500 }, { name: '500 ml', price: 2000 }], groups: ['saborShake'] },
      ],
    },
  ],
};
