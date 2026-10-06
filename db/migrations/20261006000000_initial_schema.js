import fs from 'node:fs';

// A migration inicial é o schema.sql (fonte da verdade do modelo de dados).
// Mudanças futuras viram novas migrations.
const sql = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');

const TABLES = [
  'order_item_options', 'order_items', 'order_status_history', 'orders', 'customers',
  'product_option_groups', 'option_variant_prices', 'options', 'option_groups',
  'product_variants', 'products', 'categories',
  'store_message_templates', 'payment_methods', 'delivery_zones', 'business_hours',
  'auth_codes', 'store_devices', 'stores', 'admins', 'cities',
];

export async function up(knex) {
  await knex.raw(sql);
}

export async function down(knex) {
  await knex.raw('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of TABLES) await knex.raw(`DROP TABLE IF EXISTS \`${table}\``);
  await knex.raw('SET FOREIGN_KEY_CHECKS = 1');
}
