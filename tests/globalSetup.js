// Antes de todos os testes: garante que o banco de teste está com as migrations aplicadas.
// (roda fora dos workers, então define as variáveis aqui antes de carregar o knexfile)
export default async function setup() {
  await import('dotenv/config'); // o .env manda; os padrões abaixo só valem para o que faltar
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST ||= '127.0.0.1';
  process.env.DB_PORT ||= '3306';
  process.env.DB_NAME_TEST ||= 'delivroo2_test';

  const { default: knex } = await import('knex');
  const { default: config } = await import('../knexfile.js');
  const db = knex(config);
  await db.migrate.latest();
  await db.destroy();
}