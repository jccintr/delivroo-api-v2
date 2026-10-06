import { describe, it, expect } from 'vitest';
import db from '../db/knex.js';
import { api, auth, createCity, registerStore } from './factories/helpers.js';

describe('Cidades', () => {
  it('lista só cidades ativas', async () => {
    await createCity({ name: 'Ativa', slug: 'ativa-mg' });
    await createCity({ name: 'Inativa', slug: 'inativa-mg', active: false });
    const res = await api().get('/api/cities');
    expect(res.status).toBe(200);
    expect(res.body.map((c) => c.name)).toEqual(['Ativa']);
  });
});

describe('POST /api/stores/register', () => {
  it('cria a loja, gera slug e devolve token (sem senha)', async () => {
    const city = await createCity();
    const res = await api().post('/api/stores/register').send({
      name: 'Pizzaria do Beto', email: 'beto@teste.com', password: '123456', phone: '35999999999', cityId: city.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.store.slug).toBe('pizzaria-do-beto');
    expect(res.body.store.isOpen).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('gera slugs diferentes para nomes iguais', async () => {
    const a = await registerStore({ name: 'Lanchonete Boa' });
    const b = await registerStore({ name: 'Lanchonete Boa', cityId: a.cityId });
    expect(a.store.slug).toBe('lanchonete-boa');
    expect(b.store.slug).toBe('lanchonete-boa-2');
  });

  it('recusa email repetido (409) e cidade inexistente (422)', async () => {
    const a = await registerStore({ email: 'igual@teste.com' });
    const dup = await api().post('/api/stores/register').send({ name: 'Outra Loja', email: 'igual@teste.com', password: '123456', phone: '35999999999', cityId: a.cityId });
    expect(dup.status).toBe(409);

    const badCity = await api().post('/api/stores/register').send({ name: 'Outra Loja', email: 'x@teste.com', password: '123456', phone: '35999999999', cityId: 99999 });
    expect(badCity.status).toBe(422);
  });

  it('valida os campos (400 com detalhes)', async () => {
    const res = await api().post('/api/stores/register').send({ name: 'ab', email: 'invalido', password: '1' });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toEqual(expect.arrayContaining(['name', 'email', 'password', 'phone', 'cityId']));
  });
});

describe('POST /api/stores/login', () => {
  it('entra com a senha certa', async () => {
    await registerStore({ email: 'login@teste.com', password: 'segredo123' });
    const res = await api().post('/api/stores/login').send({ email: 'login@teste.com', password: 'segredo123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
  });

  it('recusa senha errada e email inexistente com a mesma resposta (401)', async () => {
    await registerStore({ email: 'login@teste.com', password: 'segredo123' });
    const wrong = await api().post('/api/stores/login').send({ email: 'login@teste.com', password: 'errada' });
    const unknown = await api().post('/api/stores/login').send({ email: 'naoexiste@teste.com', password: 'qualquer' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('loja desativada não entra (403)', async () => {
    const { store } = await registerStore({ email: 'off@teste.com', password: 'segredo123' });
    await db('stores').where({ id: store.id }).update({ active: false });
    const res = await api().post('/api/stores/login').send({ email: 'off@teste.com', password: 'segredo123' });
    expect(res.status).toBe(403);
  });
});

describe('Rotas autenticadas', () => {
  it('sem token ou com token inválido: 401', async () => {
    expect((await api().get('/api/stores/me')).status).toBe(401);
    expect((await api().get('/api/stores/me').set(auth('lixo'))).status).toBe(401);
  });

  it('token de loja desativada deixa de valer', async () => {
    const { token, store } = await registerStore();
    await db('stores').where({ id: store.id }).update({ active: false });
    expect((await api().get('/api/stores/me').set(auth(token))).status).toBe(401);
  });

  it('GET /me devolve a própria loja', async () => {
    const { token, store } = await registerStore();
    const res = await api().get('/api/stores/me').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(store.id);
  });

  it('PATCH /me atualiza perfil e valida cores e espera', async () => {
    const { token } = await registerStore();
    const ok = await api().patch('/api/stores/me').set(auth(token)).send({
      street: 'Rua A', number: '10', district: 'Centro', bgColor: '#FF6B35', pixKey: 'loja@pix.com', waitMinMinutes: 30, waitMaxMinutes: 40,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.address.street).toBe('Rua A');
    expect(ok.body.bgColor).toBe('#FF6B35');

    expect((await api().patch('/api/stores/me').set(auth(token)).send({ bgColor: 'vermelho' })).status).toBe(400);
    expect((await api().patch('/api/stores/me').set(auth(token)).send({ waitMinMinutes: 50 })).status).toBe(422);
  });

  it('abrir a loja marca o início do turno; fechar mantém', async () => {
    const { token } = await registerStore();
    const open = await api().patch('/api/stores/me/status').set(auth(token)).send({ isOpen: true });
    expect(open.body.isOpen).toBe(true);
    expect(open.body.openedAt).not.toBeNull();

    const closed = await api().patch('/api/stores/me/status').set(auth(token)).send({ isOpen: false });
    expect(closed.body.isOpen).toBe(false);
    expect(closed.body.openedAt).toBe(open.body.openedAt);

    expect((await api().patch('/api/stores/me/status').set(auth(token)).send({ isOpen: 'sim' })).status).toBe(400);
  });
});
