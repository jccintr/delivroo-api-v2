import pizzaria from './pizzaria.js';
import hamburgueria from './hamburgueria.js';
import acai from './acai.js';

// Templates de cardápio oferecidos no cadastro da loja. Para criar um novo: adicione o arquivo e registre aqui.
export const TEMPLATES = { pizzaria, hamburgueria, acai };
export const TEMPLATE_KEYS = Object.keys(TEMPLATES);

// "Loja vazia" não é um template de verdade (não cria nada): existe só para aparecer na lista de escolhas.
export const EMPTY_CHOICE = { key: 'empty', name: 'Loja vazia', description: 'Comece do zero e monte o seu cardápio.' };

/** lista para o cadastro: "Loja vazia" + um resumo de cada template */
export function listTemplateChoices() {
  const templates = TEMPLATE_KEYS.map((key) => {
    const t = TEMPLATES[key];
    return {
      key: t.key,
      name: t.name,
      description: t.description,
      categories: t.catalog.length,
      products: t.catalog.reduce((sum, c) => sum + c.products.length, 0),
    };
  });
  return [{ ...EMPTY_CHOICE, categories: 0, products: 0 }, ...templates];
}
