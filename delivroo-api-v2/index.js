import dotenv from 'dotenv';
import app from './app.js';
import db from './db/knex.js';

dotenv.config();

async function start() {
  try {
    // 1. confere o banco antes de subir
    await db.raw('SELECT 1');
    console.log('Conectado ao banco de dados com sucesso!');

    // 2. sobe o servidor
    app.listen(process.env.PORT || 3000, () => {
      console.log('Servidor ouvindo a porta ' + (process.env.PORT || 3000));
    });
  } catch (error) {
    console.error('Falha ao iniciar a aplicação:', error);
    process.exit(1);
  }
}

start();
