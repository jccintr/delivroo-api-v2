import 'dotenv/config'; // lê o .env ANTES dos padrões abaixo (dotenv não sobrescreve o que já existe)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/globalSetup.js'],
    setupFiles: ['./tests/setup.js'],
    fileParallelism: false, // os testes compartilham o mesmo banco de teste
    env: {
      NODE_ENV: 'test',
      JWT_SECRET_STORE: 'segredo-de-teste',
      JWT_SECRET_ADMIN: 'segredo-admin-de-teste',
      SSE_HEARTBEAT_MS: '150', // heartbeat rápido para o teste
      SSE_MAX_PER_CHANNEL: '3',
      DB_HOST: process.env.DB_HOST || '127.0.0.1',
      DB_PORT: process.env.DB_PORT || '3306',
      DB_USER: process.env.DB_USER ?? '',
      DB_PASSWORD: process.env.DB_PASSWORD ?? '',
      DB_NAME_TEST: process.env.DB_NAME_TEST || 'delivroo2_test',
    },
  },
});
