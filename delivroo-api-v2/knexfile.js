import dotenv from 'dotenv';

dotenv.config();

const isTest = process.env.NODE_ENV === 'test';

export default {
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: isTest ? process.env.DB_NAME_TEST : process.env.DB_NAME,
    charset: 'utf8mb4',
    timezone: 'Z',            // datas em UTC
    dateStrings: false,
    multipleStatements: true, // só para a migration inicial rodar o schema.sql
    decimalNumbers: true,
  },
  pool: {
    min: 0,
    max: 10,
    // Todas as datas em UTC, independente do fuso do servidor MySQL
    // (senão CURRENT_TIMESTAMP sairia no fuso do servidor e as datas gravadas pelo app em UTC).
    afterCreate: (conn, done) => conn.query("SET time_zone = '+00:00'", (err) => done(err, conn)),
  },
  migrations: { directory: './db/migrations' },
};
