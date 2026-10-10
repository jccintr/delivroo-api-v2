// Cidades deixam de ser uma lista pré-cadastrada: a fonte é o IBGE (API de localidades).
// `ibge_id` é o código do município no IBGE. A linha em `cities` é criada sob demanda, quando a primeira
// loja daquela cidade se cadastra; cidades antigas (sem ibge_id) são "adotadas" no primeiro cadastro que
// escolher o mesmo município (ver services/cities.js).

export async function up(knex) {
  await knex.schema.alterTable('cities', (t) => {
    t.integer('ibge_id').unsigned().nullable();
    t.unique(['ibge_id'], { indexName: 'uq_cities_ibge_id' });
  });
}

export async function down(knex) {
  await knex.schema.alterTable('cities', (t) => {
    t.dropUnique(['ibge_id'], 'uq_cities_ibge_id');
    t.dropColumn('ibge_id');
  });
}
