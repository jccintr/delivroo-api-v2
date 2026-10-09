// Assinaturas das lojas: planos, assinatura (1 por loja), faturas (Pix manual no começo) e histórico.
//
// Datas de cobrança são DATE (dias, fuso de Brasília), não instantes: "teste até 23/10" é mais fácil de
// explicar e de conferir do que um horário. O acesso da loja é CALCULADO a partir dessas datas na hora da
// leitura (services/storeAccess.js), então não depende de cron para suspender ninguém.

const TRIAL_DAYS = 14;

export async function up(knex) {
  await knex.schema.createTable('plans', (t) => {
    t.increments('id');
    t.string('name', 80).notNullable();
    t.string('description', 255).nullable();
    t.integer('price_cents').unsigned().notNullable(); // preço MENSAL; a fatura guarda cópia do valor
    t.integer('position').notNullable().defaultTo(0);
    t.boolean('active').notNullable().defaultTo(true); // plano desativado não aparece para novas escolhas, mas quem já tem continua
    t.datetime('created_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    t.datetime('updated_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)'));
  });

  await knex.schema.createTable('subscriptions', (t) => {
    t.increments('id');
    t.integer('store_id').unsigned().notNullable().unique().references('id').inTable('stores').onDelete('CASCADE');
    t.integer('plan_id').unsigned().nullable().references('id').inTable('plans'); // null = ainda não escolheu (período de teste)
    t.date('trial_ends_on').notNullable();     // último dia do teste (inclusive)
    t.date('paid_until').nullable();           // último dia já pago (inclusive)
    t.date('courtesy_until').nullable();       // cortesia (plano grátis) até este dia
    t.boolean('courtesy_indefinite').notNullable().defaultTo(false);
    t.datetime('created_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    t.datetime('updated_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)'));
  });

  await knex.schema.createTable('invoices', (t) => {
    t.increments('id');
    t.integer('store_id').unsigned().notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.integer('subscription_id').unsigned().notNullable().references('id').inTable('subscriptions').onDelete('CASCADE');
    t.integer('plan_id').unsigned().notNullable().references('id').inTable('plans');
    t.integer('amount_cents').unsigned().notNullable(); // cópia do preço do plano no momento da fatura
    t.date('period_start').notNullable();
    t.date('period_end').notNullable();
    t.date('due_on').notNullable();                      // pagar até este dia para não interromper o serviço
    t.enu('status', ['OPEN', 'PAID', 'VOID']).notNullable().defaultTo('OPEN');
    // Truque para "no máximo 1 fatura aberta por assinatura": vale 1 quando OPEN e NULL nos demais
    // (o MySQL aceita vários NULL num índice único).
    t.tinyint('open_slot').nullable();
    t.string('provider', 30).notNullable().defaultTo('manual'); // futuro: gateway de pagamento
    t.string('provider_ref', 120).nullable();
    t.datetime('reported_paid_at', { precision: 3 }).nullable(); // loja clicou em "Já paguei"
    t.string('reported_note', 255).nullable();
    t.datetime('paid_at', { precision: 3 }).nullable();
    t.integer('paid_by_admin_id').unsigned().nullable().references('id').inTable('admins');
    t.string('payment_note', 255).nullable();
    t.datetime('created_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    t.unique(['subscription_id', 'open_slot'], { indexName: 'ux_invoice_one_open' });
    t.index(['store_id', 'created_at'], 'ix_invoice_store');
    t.index(['status', 'due_on'], 'ix_invoice_status_due');
  });

  await knex.schema.createTable('billing_events', (t) => {
    t.increments('id');
    t.integer('store_id').unsigned().notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.integer('invoice_id').unsigned().nullable().references('id').inTable('invoices').onDelete('SET NULL');
    t.string('type', 40).notNullable(); // SUBSCRIPTION_CREATED, PLAN_CHOSEN, INVOICE_CREATED, PAYMENT_REPORTED, INVOICE_PAID...
    t.string('actor', 20).notNullable().defaultTo('system'); // system | store | admin
    t.json('details').nullable();
    t.datetime('created_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    t.index(['store_id', 'created_at'], 'ix_billing_events_store');
  });

  // Lojas que já existem entram em teste de 14 dias a partir de hoje (ninguém é suspenso de surpresa).
  const stores = await knex('stores').select('id');
  if (stores.length) {
    const end = new Date(Date.now() - 3 * 3600 * 1000 + TRIAL_DAYS * 86400000).toISOString().slice(0, 10);
    await knex('subscriptions').insert(stores.map((s) => ({ store_id: s.id, trial_ends_on: end })));
    await knex('billing_events').insert(stores.map((s) => ({
      store_id: s.id, type: 'SUBSCRIPTION_CREATED', actor: 'system', details: JSON.stringify({ trialEndsOn: end, backfill: true }),
    })));
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('billing_events');
  await knex.schema.dropTableIfExists('invoices');
  await knex.schema.dropTableIfExists('subscriptions');
  await knex.schema.dropTableIfExists('plans');
}
