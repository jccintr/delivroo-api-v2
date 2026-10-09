// Atalhos para escrever templates de cardápio.
//
// Formato de um template (o mesmo usado pelo seed da loja de exemplo):
//   groups:  { chave: { name, min, max, perOption?, mode: 'ADDITIVE' | 'HIGHEST',
//                       options: [[nome, descrição|null, preço, padrão?], ...] } }
//            preço = centavos (número) ou { NomeDaVariação: centavos } para preço por tamanho.
//   catalog: [{ category, products: [{ name, description, variants: [{ name, description?, price }], groups: [chave, ...] }] }]
//
// Dinheiro SEMPRE em centavos. Os preços dos templates são exemplos: o dono da loja deve revisá-los.

/** variação única ("Único"), para produtos sem tamanhos */
export const single = (price, description = null) => [{ name: 'Único', description, price }];

export const PIZZA_SIZES = [
  { name: 'Broto', description: '4 fatias · 25 cm', price: 0 },
  { name: 'Grande', description: '8 fatias · 35 cm', price: 0 },
];

// grupos de bebida usados por mais de um template
export const SABOR_REFRI = {
  name: 'Sabor do refrigerante', min: 1, max: 1, mode: 'ADDITIVE',
  options: [['Coca-Cola', null, 0], ['Guaraná Antarctica', null, 0], ['Fanta Laranja', null, 0], ['Sprite', null, 0]],
};

export const SABOR_SUCO = {
  name: 'Sabor do suco', min: 1, max: 1, mode: 'ADDITIVE',
  options: [['Laranja', null, 0], ['Limão', null, 0], ['Maracujá', null, 0], ['Abacaxi com Hortelã', null, 0]],
};

export const BEBIDAS = [
  { name: 'Refrigerante', description: 'Gelado, escolha o sabor.', variants: [{ name: 'Lata 350 ml', price: 600 }, { name: '600 ml', price: 900 }, { name: '2 L', price: 1400 }], groups: ['saborRefri'] },
  { name: 'Suco Natural', description: 'Feito na hora, com fruta de verdade.', variants: [{ name: '300 ml', price: 900 }, { name: '500 ml', price: 1300 }], groups: ['saborSuco'] },
  { name: 'Água Mineral', description: null, variants: [{ name: 'Sem gás', description: '500 ml', price: 400 }, { name: 'Com gás', description: '500 ml', price: 450 }], groups: [] },
];
