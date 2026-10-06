// Carrega a loja de exemplo (pizzaria) para desenvolvimento.
//   login:  loja@exemplo.com / 123456      cardápio: GET /api/public/stores/pizzaria-exemplo/menu
// Rode depois de `npm run migrate`. Só use em banco de desenvolvimento.
import fs from 'node:fs';
import bcryptjs from 'bcryptjs';
import db from '../db/knex.js';

const sql = fs.readFileSync(new URL('../db/seed.sql', import.meta.url), 'utf8');

try {
  const existing = await db('stores').where({ slug: 'pizzaria-exemplo' }).first('id');
  if (existing) {
    console.log('A loja de exemplo já existe. Nada a fazer.');
  } else {
    await db.raw(sql);
    await db('stores').where({ slug: 'pizzaria-exemplo' }).update({
      password_hash: await bcryptjs.hash('123456', 10),
      is_open: true,
      opened_at: new Date(),
    });
    console.log('Loja de exemplo criada: loja@exemplo.com / 123456  (slug: pizzaria-exemplo)');
  }
} finally {
  await db.destroy();
}
