// Backoffice (admin geral): auditoria das ações do admin, motivo/data do bloqueio manual da loja
// e último login do admin. A tabela `admins` já existia desde a migration inicial.

export async function up(knex) {
  await knex.schema.alterTable('admins', (t) => {
    t.datetime('last_login_at', { precision: 3 }).nullable();
  });

  // `stores.active` continua sendo o bloqueio MANUAL feito pelo admin geral (fraude, pedido do dono...).
  // Quando houver cobrança, o estado da assinatura ficará em outra tabela, sem misturar com este flag.
  await knex.schema.alterTable('stores', (t) => {
    t.datetime('deactivated_at', { precision: 3 }).nullable();
    t.string('deactivation_reason', 255).nullable(); // nota interna do admin; a loja não vê
  });

  await knex.schema.createTable('admin_audit_log', (t) => {
    t.increments('id');
    t.integer('admin_id').unsigned().notNullable().references('id').inTable('admins'); // admins são desativados, nunca apagados
    t.integer('store_id').unsigned().nullable().references('id').inTable('stores').onDelete('SET NULL');
    t.string('action', 60).notNullable(); // ex.: STORE_DEACTIVATED, STORE_ACTIVATED, ADMIN_PASSWORD_CHANGED
    t.json('details').nullable();
    t.datetime('created_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    t.index(['store_id', 'created_at'], 'ix_audit_store');
    t.index(['created_at'], 'ix_audit_created');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('admin_audit_log');
  await knex.schema.alterTable('stores', (t) => {
    t.dropColumn('deactivation_reason');
    t.dropColumn('deactivated_at');
  });
  await knex.schema.alterTable('admins', (t) => {
    t.dropColumn('last_login_at');
  });
}
