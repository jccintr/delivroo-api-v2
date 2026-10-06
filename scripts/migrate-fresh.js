// Equivalente ao `migrate:fresh` do Laravel: APAGA todas as tabelas do banco e recria tudo do zero.
//
//   npm run migrate:fresh                # apaga tudo + roda as migrations
//   npm run migrate:fresh:seed           # idem + carrega a loja de exemplo (loja@exemplo.com / 123456)
//   npm run migrate:fresh -- --yes       # sem pedir confirmação
//   npm run migrate:fresh -- --drop-only # só apaga (deixa o banco vazio, sem tabelas)
//
// Segurança: pede confirmação digitando o nome do banco; com NODE_ENV=production só roda com --force.
import readline from 'node:readline/promises';
import { stdin, stdout, exit } from 'node:process';
import knex from 'knex';
import config from '../knexfile.js';

const args = new Set(process.argv.slice(2));
const database = config.connection.database;

if (!database) {
  console.error('DB_NAME não definido no .env (ou DB_NAME_TEST, se NODE_ENV=test).');
  exit(1);
}
if (process.env.NODE_ENV === 'production' && !args.has('--force')) {
  console.error('Bloqueado: NODE_ENV=production. Se for isso mesmo, rode com --force.');
  exit(1);
}

console.log(`Banco: ${database} @ ${config.connection.host}:${config.connection.port}`);

if (!args.has('--yes')) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`Isso APAGA todas as tabelas e dados de "${database}". Digite o nome do banco para confirmar: `);
  rl.close();
  if (answer.trim() !== database) {
    console.log('Cancelado.');
    exit(1);
  }
}

const db = knex(config);

try {
  // 1) apaga tudo (tabelas e views), com as chaves estrangeiras desligadas na MESMA conexão
  await db.transaction(async (trx) => {
    await trx.raw('SET FOREIGN_KEY_CHECKS = 0');
    const [rows] = await trx.raw(
      'SELECT table_name AS name, table_type AS type FROM information_schema.tables WHERE table_schema = ?',
      [database],
    );
    for (const { name, type } of rows) {
      await trx.raw(type === 'VIEW' ? 'DROP VIEW IF EXISTS ??' : 'DROP TABLE IF EXISTS ??', [name]);
    }
    await trx.raw('SET FOREIGN_KEY_CHECKS = 1');
    console.log(`${rows.length} tabela(s) removida(s).`);
  });

  if (args.has('--drop-only')) {
    console.log('Banco vazio.');
  } else {
    // 2) recria o schema
    const [batch, files] = await db.migrate.latest();
    console.log(`Migrations aplicadas (lote ${batch}): ${files.length ? files.join(', ') : 'nenhuma'}`);
  }

  // 3) opcional: dados de exemplo
  if (args.has('--seed') && !args.has('--drop-only')) {
    const { DEMO, seedDemo } = await import('../db/seed-demo.js');
    const r = await seedDemo(db);
    console.log(`Loja de exemplo criada: ${r.categories} categorias, ${r.products} produtos, ${r.groups} grupos de opções.`);
    console.log(`Login: ${DEMO.email} / ${DEMO.password}  (slug: ${DEMO.slug})`);
  }
} catch (err) {
  console.error('Falhou:', err.message);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
