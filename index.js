import dotenv from 'dotenv';
import app from './app.js';
import db from './db/knex.js';
import { closeAll } from './services/events.js';

dotenv.config();

async function start() {
  try {
    // 1. confere o banco antes de subir
    await db.raw('SELECT 1');
    console.log('Conectado ao banco de dados com sucesso!');

    // 2. sobe o servidor
    const server = app.listen(process.env.PORT || 3000, () => {
      console.log('Servidor ouvindo a porta ' + (process.env.PORT || 3000));
    });

    // desligamento limpo: fecha os fluxos SSE (senão server.close() espera conexões que nunca terminam)
    const shutdown = () => { closeAll(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('Falha ao iniciar a aplicação:', error);
    process.exit(1);
  }
}

start();
