// Carrega a loja de exemplo COMPLETA (pizzaria: 6 categorias, ~40 produtos) para desenvolvimento.
//   login:  loja@exemplo.com / 123456      cardápio: GET /api/public/stores/pizzaria-exemplo/menu
// Rode depois de `npm run migrate`. Só use em banco de desenvolvimento.
import db from '../db/knex.js';
import { DEMO, seedDemo } from '../db/seed-demo.js';

try {
  if (await db('stores').where({ slug: DEMO.slug }).first('id')) {
    console.log('A loja de exemplo já existe. Para recriar do zero: npm run migrate:fresh:seed');
  } else {
    const r = await seedDemo(db);
    console.log(`Loja de exemplo criada: ${r.categories} categorias, ${r.products} produtos, ${r.groups} grupos de opções.`);
    console.log(`Login: ${DEMO.email} / ${DEMO.password}  (slug: ${DEMO.slug})`);
  }
} finally {
  await db.destroy();
}
