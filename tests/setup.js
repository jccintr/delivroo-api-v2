import { afterAll, beforeEach } from 'vitest';
import db from '../db/knex.js';

const TABLES = [
  'order_item_options', 'order_items', 'order_status_history', 'orders', 'customers',
  'product_option_groups', 'option_variant_prices', 'options', 'option_groups',
  'product_variants', 'products', 'categories',
  'store_message_templates', 'payment_methods', 'delivery_zones', 'business_hours',
  'auth_codes', 'store_devices', 'admin_audit_log', 'stores', 'admins', 'cities',
];

// Trava de segurança: os testes APAGAM todas as tabelas. Só rodam em banco cujo nome termina com "_test".
const dbName = db.client.config.connection.database || '';
if (!dbName.endsWith('_test')) {
  throw new Error(`Recusando rodar testes no banco "${dbName}". Use DB_NAME_TEST com nome terminado em _test.`);
}

// Banco limpo antes de cada teste.
beforeEach(async () => {
  await db.raw('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of TABLES) await db(t).del();
  await db.raw('SET FOREIGN_KEY_CHECKS = 1');
});

afterAll(async () => {
  await db.destroy();
});
