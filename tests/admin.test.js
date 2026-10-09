import { beforeEach, describe, expect, it } from 'vitest';
import jsonwebtoken from 'jsonwebtoken';
import db from '../db/knex.js';
import { adminLoginThrottle } from '../utils/loginThrottle.js';
import { createAdmin, resetAdminPassword } from '../services/adminAccounts.js';
import { parseDetails } from '../services/audit.js';
import { api, auth, createAdminUser, createCity, registerStore, seedPizzaria } from './factories/helpers.js';

beforeEach(() => adminLoginThrottle.clear());

describe('POST /api/admin/login', () => {
  it('entra com a senha certa, devolve o admin (sem hash) e registra o último login', async () => {
    const { email, password } = await createAdminUser();
    const res = await api().post('/api/admin/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.admin).toMatchObject({ email, active: true });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
    expect((await db('admins').where({ email }).first()).last_login_at).not.toBeNull();
  });

  it('aceita o email em maiúsculas e com espaços', async () => {
    const { email, password } = await createAdminUser();
    const res = await api().post('/api/admin/login').send({ email: `  ${email.toUpperCase()} `, password });
    expect(res.status).toBe(200);
  });

  it('senha errada e email inexistente têm a mesma resposta (401)', async () => {
    const { email } = await createAdminUser();
    const wrong = await api().post('/api/admin/login').send({ email, password: 'errada-errada' });
    const unknown = await api().post('/api/admin/login').send({ email: 'ninguem@delivroo.test', password: 'qualquer-coisa' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('admin desativado não entra (403) — só depois de acertar a senha', async () => {
    const { email, password } = await createAdminUser({ active: false });
    expect((await api().post('/api/admin/login').send({ email, password })).status).toBe(403);
    expect((await api().post('/api/admin/login').send({ email, password: 'errada-errada' })).status).toBe(401);
  });

  it('valida os campos (400)', async () => {
    const res = await api().post('/api/admin/login').send({ email: 'invalido' });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('trava após 5 falhas seguidas (429 + Retry-After), mesmo com a senha certa; o login certo zera a contagem', async () => {
    const { email, password } = await createAdminUser();
    for (let i = 0; i < 4; i += 1) await api().post('/api/admin/login').send({ email, password: 'errada-errada' });
    // acertar antes do limite zera a contagem
    expect((await api().post('/api/admin/login').send({ email, password })).status).toBe(200);

    for (let i = 0; i < 5; i += 1) expect((await api().post('/api/admin/login').send({ email, password: 'errada-errada' })).status).toBe(401);
    const locked = await api().post('/api/admin/login').send({ email, password });
    expect(locked.status).toBe(429);
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    expect(locked.body.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe('autenticação das rotas do admin', () => {
  it('sem token, token inválido, e token de LOJA: 401', async () => {
    const { token: storeToken } = await registerStore();
    expect((await api().get('/api/admin/me')).status).toBe(401);
    expect((await api().get('/api/admin/me').set(auth('lixo'))).status).toBe(401);
    expect((await api().get('/api/admin/stores').set(auth(storeToken))).status).toBe(401);
  });

  it('token de ADMIN não abre rotas da loja', async () => {
    const { token } = await createAdminUser();
    expect((await api().get('/api/stores/me').set(auth(token))).status).toBe(401);
  });

  it('token assinado com o segredo certo mas sem papel de admin é recusado', async () => {
    const { admin } = await createAdminUser();
    const fake = jsonwebtoken.sign({ adminId: admin.id }, process.env.JWT_SECRET_ADMIN, { expiresIn: '1h' });
    expect((await api().get('/api/admin/me').set(auth(fake))).status).toBe(401);
  });

  it('token expirado é recusado', async () => {
    const { admin } = await createAdminUser();
    const old = jsonwebtoken.sign({ adminId: admin.id, role: 'admin' }, process.env.JWT_SECRET_ADMIN, { expiresIn: -10 });
    expect((await api().get('/api/admin/me').set(auth(old))).status).toBe(401);
  });

  it('desativar o admin derruba o token dele na hora', async () => {
    const { admin, token } = await createAdminUser();
    expect((await api().get('/api/admin/me').set(auth(token))).status).toBe(200);
    await db('admins').where({ id: admin.id }).update({ active: false });
    expect((await api().get('/api/admin/me').set(auth(token))).status).toBe(401);
  });

  it('GET /me devolve o próprio admin', async () => {
    const { admin, token } = await createAdminUser();
    const res = await api().get('/api/admin/me').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(admin.id);
  });
});

describe('PATCH /api/admin/me/password', () => {
  it('troca a senha: a antiga deixa de entrar, a nova entra, e fica na auditoria', async () => {
    const { admin, email, password, token } = await createAdminUser();
    const res = await api().patch('/api/admin/me/password').set(auth(token)).send({ currentPassword: password, newPassword: 'outra-senha-forte-1' });
    expect(res.status).toBe(204);
    expect((await api().post('/api/admin/login').send({ email, password })).status).toBe(401);
    expect((await api().post('/api/admin/login').send({ email, password: 'outra-senha-forte-1' })).status).toBe(200);
    const log = await db('admin_audit_log').where({ admin_id: admin.id, action: 'ADMIN_PASSWORD_CHANGED' });
    expect(log).toHaveLength(1);
  });

  it('recusa senha atual errada (422, não 401), senha igual e senha curta (400)', async () => {
    const { password, token } = await createAdminUser();
    const wrong = await api().patch('/api/admin/me/password').set(auth(token)).send({ currentPassword: 'nao-e-essa-aqui', newPassword: 'outra-senha-forte-1' });
    expect(wrong.status).toBe(422);
    const same = await api().patch('/api/admin/me/password').set(auth(token)).send({ currentPassword: password, newPassword: password });
    expect(same.status).toBe(422);
    const short = await api().patch('/api/admin/me/password').set(auth(token)).send({ currentPassword: password, newPassword: 'curta' });
    expect(short.status).toBe(400);
  });
});

describe('GET /api/admin/stores', () => {
  async function seedStores() {
    const cityA = await createCity({ name: 'Alfenas' });
    const cityB = await createCity({ name: 'Varginha' });
    const a = await registerStore({ name: 'Pizzaria do Beto', email: 'beto@teste.com', cityId: cityA.id });
    const b = await registerStore({ name: 'Lanchonete Boa', email: 'boa@teste.com', cityId: cityB.id });
    const c = await registerStore({ name: 'Açaí Central', email: 'acai@teste.com', cityId: cityA.id });
    await db('stores').where({ id: c.store.id }).update({ active: false });
    return { cityA, cityB, a, b, c };
  }

  it('lista com paginação, mais novas primeiro, sem dados sensíveis', async () => {
    const { token } = await createAdminUser();
    const { a, b, c } = await seedStores();
    const res = await api().get('/api/admin/stores?limit=2').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 2, total: 3 });
    expect(res.body.stores.map((s) => s.id)).toEqual([c.store.id, b.store.id]);
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);

    const page2 = await api().get('/api/admin/stores?limit=2&page=2').set(auth(token));
    expect(page2.body.stores.map((s) => s.id)).toEqual([a.store.id]);
  });

  it('filtra por busca (nome, email e slug), situação e cidade', async () => {
    const { token } = await createAdminUser();
    const { cityB, a, b, c } = await seedStores();
    const ids = async (qs) => (await api().get(`/api/admin/stores?${qs}`).set(auth(token))).body.stores.map((s) => s.id).sort();

    expect(await ids('search=beto')).toEqual([a.store.id]);          // nome e email
    expect(await ids('search=lanchonete-boa')).toEqual([b.store.id]); // slug
    expect(await ids('status=inactive')).toEqual([c.store.id]);
    expect(await ids('status=active')).toEqual([a.store.id, b.store.id].sort());
    expect(await ids(`cityId=${cityB.id}`)).toEqual([b.store.id]);
    expect(await ids('status=active&search=a%25')).toEqual([]);       // % é texto, não curinga
  });

  it('traz a cidade, quantidade de pedidos e o último pedido', async () => {
    const { token } = await createAdminUser();
    const quiet = await registerStore({ name: 'Loja Parada' });
    const busy = await registerStore({ name: 'Loja Movimentada' });
    const s = await seedPizzaria(busy.token);
    const order = await api().post(`/api/public/stores/${busy.store.slug}/orders`).send({
      fulfillment: 'PICKUP', name: 'Maria', phone: '35999990000', paymentMethodId: s.pix.id,
      items: [{ productId: s.soda.id, variantId: s.soda.variants[0].id, quantity: 1 }],
    });
    expect(order.status).toBe(201);

    const res = await api().get('/api/admin/stores').set(auth(token));
    const byId = Object.fromEntries(res.body.stores.map((x) => [x.id, x]));
    expect(byId[quiet.store.id]).toMatchObject({ ordersCount: 0, lastOrderAt: null });
    expect(byId[busy.store.id].ordersCount).toBe(1);
    expect(byId[busy.store.id].lastOrderAt).not.toBeNull();
    expect(byId[busy.store.id].city).toMatchObject({ id: busy.cityId });
    expect(byId[busy.store.id].city.name).toBeTypeOf('string');
  });

  it('valida os parâmetros (400)', async () => {
    const { token } = await createAdminUser();
    expect((await api().get('/api/admin/stores?status=xyz').set(auth(token))).status).toBe(400);
    expect((await api().get('/api/admin/stores?limit=1000').set(auth(token))).status).toBe(400);
    expect((await api().get('/api/admin/stores?page=0').set(auth(token))).status).toBe(400);
  });
});

describe('GET /api/admin/stores/:id', () => {
  it('detalha a loja com contagem de produtos; 404 se não existe; 400 se ID inválido', async () => {
    const { token } = await createAdminUser();
    const { token: storeToken, store } = await registerStore();
    await seedPizzaria(storeToken);

    const res = await api().get(`/api/admin/stores/${store.id}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: store.id, slug: store.slug, active: true, productsCount: 3, ordersCount: 0 });
    expect(res.body.address).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);

    expect((await api().get('/api/admin/stores/99999').set(auth(token))).status).toBe(404);
    expect((await api().get('/api/admin/stores/abc').set(auth(token))).status).toBe(400);
  });
});

describe('PATCH /api/admin/stores/:id/active', () => {
  it('desativar: fecha a loja, derruba login, token e cardápio, guarda o motivo e audita', async () => {
    const { admin, token } = await createAdminUser();
    const { token: storeToken, store } = await registerStore({ email: 'dono@teste.com', password: 'segredo123' });
    await seedPizzaria(storeToken);
    expect((await db('stores').where({ id: store.id }).first()).is_open).toBe(1); // seedPizzaria abre a loja
    expect((await api().get(`/api/public/stores/${store.slug}/menu`)).status).toBe(200);

    const res = await api().patch(`/api/admin/stores/${store.id}/active`).set(auth(token)).send({ active: false, reason: '  Inadimplência combinada  ' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ active: false, isOpen: false, deactivationReason: 'Inadimplência combinada' });
    expect(res.body.deactivatedAt).not.toBeNull();

    const login = await api().post('/api/stores/login').send({ email: 'dono@teste.com', password: 'segredo123' });
    expect(login.status).toBe(403);
    expect(login.body).toMatchObject({ error: 'Conta desativada.', code: 'STORE_BLOCKED' });

    const old = await api().get('/api/stores/me').set(auth(storeToken));
    expect(old.status).toBe(401);
    expect(old.body.code).toBe('STORE_BLOCKED');

    const blockedMenu = await api().get(`/api/public/stores/${store.slug}/menu`);
    expect(blockedMenu.status).toBe(403);
    expect(blockedMenu.body.code).toBe('MENU_UNAVAILABLE');

    const [entry] = await db('admin_audit_log').where({ store_id: store.id });
    expect(entry).toMatchObject({ admin_id: admin.id, action: 'STORE_DEACTIVATED' });
    expect(parseDetails(entry.details)).toEqual({ reason: 'Inadimplência combinada' });
  });

  it('reativar: limpa motivo e data, a loja volta a entrar (fechada) e o cardápio volta', async () => {
    const { token } = await createAdminUser();
    const { store } = await registerStore({ email: 'volta@teste.com', password: 'segredo123' });
    await api().patch(`/api/admin/stores/${store.id}/active`).set(auth(token)).send({ active: false, reason: 'teste' }).expect(200);

    const res = await api().patch(`/api/admin/stores/${store.id}/active`).set(auth(token)).send({ active: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ active: true, isOpen: false, deactivatedAt: null, deactivationReason: null });

    expect((await api().post('/api/stores/login').send({ email: 'volta@teste.com', password: 'segredo123' })).status).toBe(200);
    expect((await api().get(`/api/public/stores/${store.slug}/menu`)).status).toBe(200);
    const actions = (await db('admin_audit_log').where({ store_id: store.id }).orderBy('id')).map((l) => l.action);
    expect(actions).toEqual(['STORE_DEACTIVATED', 'STORE_ACTIVATED']);
  });

  it('é idempotente: repetir o mesmo estado não duplica a auditoria nem apaga o motivo', async () => {
    const { token } = await createAdminUser();
    const { store } = await registerStore();
    await api().patch(`/api/admin/stores/${store.id}/active`).set(auth(token)).send({ active: false, reason: 'primeiro' }).expect(200);
    const again = await api().patch(`/api/admin/stores/${store.id}/active`).set(auth(token)).send({ active: false, reason: 'segundo' });
    expect(again.status).toBe(200);
    expect(again.body.deactivationReason).toBe('primeiro');
    expect(await db('admin_audit_log').where({ store_id: store.id })).toHaveLength(1);
    // ativar loja que já está ativa também não audita
    const { store: other } = await registerStore();
    await api().patch(`/api/admin/stores/${other.id}/active`).set(auth(token)).send({ active: true }).expect(200);
    expect(await db('admin_audit_log').where({ store_id: other.id })).toHaveLength(0);
  });

  it('valida: active booleano de verdade, motivo até 255; 404 para loja inexistente', async () => {
    const { token } = await createAdminUser();
    const { store } = await registerStore();
    const put = (id, body) => api().patch(`/api/admin/stores/${id}/active`).set(auth(token)).send(body);
    expect((await put(store.id, {})).status).toBe(400);
    expect((await put(store.id, { active: 'false' })).status).toBe(400);
    expect((await put(store.id, { active: false, reason: 'x'.repeat(256) })).status).toBe(400);
    expect((await put(99999, { active: false })).status).toBe(404);
    expect((await db('stores').where({ id: store.id }).first()).active).toBe(1);
  });

  it('exige login de admin', async () => {
    const { token: storeToken, store } = await registerStore();
    expect((await api().patch(`/api/admin/stores/${store.id}/active`).send({ active: false })).status).toBe(401);
    expect((await api().patch(`/api/admin/stores/${store.id}/active`).set(auth(storeToken)).send({ active: false })).status).toBe(401);
  });
});

describe('GET /api/admin/audit-log', () => {
  it('lista as ações com admin e loja, filtra por loja e pagina', async () => {
    const { admin, token } = await createAdminUser();
    const { store: s1 } = await registerStore({ name: 'Loja Um' });
    const { store: s2 } = await registerStore({ name: 'Loja Dois' });
    await api().patch(`/api/admin/stores/${s1.id}/active`).set(auth(token)).send({ active: false, reason: 'motivo 1' });
    await api().patch(`/api/admin/stores/${s2.id}/active`).set(auth(token)).send({ active: false });
    await api().patch(`/api/admin/stores/${s1.id}/active`).set(auth(token)).send({ active: true });

    const all = await api().get('/api/admin/audit-log').set(auth(token));
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(3);
    expect(all.body.entries.map((e) => e.action)).toEqual(['STORE_ACTIVATED', 'STORE_DEACTIVATED', 'STORE_DEACTIVATED']);
    expect(all.body.entries[0]).toMatchObject({ admin: { id: admin.id, name: admin.name }, store: { id: s1.id, name: 'Loja Um' } });

    const only1 = await api().get(`/api/admin/audit-log?storeId=${s1.id}`).set(auth(token));
    expect(only1.body.total).toBe(2);
    expect(only1.body.entries.find((e) => e.action === 'STORE_DEACTIVATED').details).toEqual({ reason: 'motivo 1' });

    const paged = await api().get('/api/admin/audit-log?limit=1&page=3').set(auth(token));
    expect(paged.body.entries).toHaveLength(1);
    expect((await api().get('/api/admin/audit-log?storeId=x').set(auth(token))).status).toBe(400);
  });
});

describe('criação de admin pelo script (services/adminAccounts)', () => {
  it('cria o admin com email normalizado e senha que realmente entra', async () => {
    const admin = await createAdmin(db, { name: 'Julio Cintra', email: '  Julio@Delivroo.Test ', password: 'senha-bem-longa-1' });
    expect(admin).toMatchObject({ name: 'Julio Cintra', email: 'julio@delivroo.test', active: 1 });
    const res = await api().post('/api/admin/login').send({ email: 'JULIO@delivroo.test', password: 'senha-bem-longa-1' });
    expect(res.status).toBe(200);
  });

  it('recusa email repetido (409), senha curta e dados inválidos (422)', async () => {
    await createAdmin(db, { name: 'Julio Cintra', email: 'a@delivroo.test', password: 'senha-bem-longa-1' });
    await expect(createAdmin(db, { name: 'Outro Nome', email: 'A@delivroo.test', password: 'senha-bem-longa-1' })).rejects.toMatchObject({ status: 409 });
    await expect(createAdmin(db, { name: 'Outro Nome', email: 'b@delivroo.test', password: 'curta' })).rejects.toMatchObject({ status: 422 });
    await expect(createAdmin(db, { name: 'ab', email: 'invalido', password: 'senha-bem-longa-1' })).rejects.toMatchObject({ status: 422 });
  });

  it('reset de senha troca a senha, reativa o admin e audita', async () => {
    const { admin, email } = await createAdminUser({ active: false });
    await resetAdminPassword(db, { email, password: 'nova-senha-longa-9' });
    expect((await api().post('/api/admin/login').send({ email, password: 'nova-senha-longa-9' })).status).toBe(200);
    expect(await db('admin_audit_log').where({ admin_id: admin.id, action: 'ADMIN_PASSWORD_RESET_CLI' })).toHaveLength(1);
    await expect(resetAdminPassword(db, { email: 'naoexiste@delivroo.test', password: 'nova-senha-longa-9' })).rejects.toMatchObject({ status: 404 });
  });
});
