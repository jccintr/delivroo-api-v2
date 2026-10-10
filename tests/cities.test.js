import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../db/knex.js';
import { clearIbgeCache } from '../services/ibge.js';
import { api, auth, createAdminUser, createCity, registerStore } from './factories/helpers.js';

// O IBGE é simulado: os testes não dependem de internet.
const ESTADOS = [
  { id: 31, sigla: 'MG', nome: 'Minas Gerais' },
  { id: 35, sigla: 'SP', nome: 'São Paulo' },
  { id: 12, sigla: 'AC', nome: 'Acre' },
];
const MUNICIPIOS = {
  MG: [{ id: 3152501, nome: 'Pouso Alegre' }, { id: 3106200, nome: 'Belo Horizonte' }, { id: 3105608, nome: 'Barbacena' }],
  SP: [{ id: 3550308, nome: 'São Paulo' }],
};
const byId = {
  3152501: { id: 3152501, nome: 'Pouso Alegre', microrregiao: { mesorregiao: { UF: { sigla: 'MG' } } } },
  3550308: { id: 3550308, nome: 'São Paulo', microrregiao: { mesorregiao: { UF: { sigla: 'SP' } } } },
  1100015: { id: 1100015, nome: "Alta Floresta D'Oeste", 'regiao-imediata': { 'regiao-intermediaria': { UF: { sigla: 'RO' } } } },
};

let calls;
let down;
const fakeFetch = vi.fn(async (url) => {
  calls.push(String(url));
  if (down) return { ok: false, status: 500, json: async () => ({}) };
  const u = String(url);
  let m;
  if (u.includes('/estados?')) return { ok: true, json: async () => ESTADOS };
  if ((m = u.match(/\/estados\/(\w+)\/municipios/))) return { ok: true, json: async () => MUNICIPIOS[m[1]] ?? [] };
  if ((m = u.match(/\/municipios\/(\d+)/))) {
    return byId[m[1]] ? { ok: true, json: async () => byId[m[1]] } : { ok: true, json: async () => [] };
  }
  return { ok: false, status: 404, json: async () => ({}) };
});

beforeEach(() => {
  calls = [];
  down = false;
  clearIbgeCache();
  vi.stubGlobal('fetch', fakeFetch);
});
afterEach(() => vi.unstubAllGlobals());

describe('estados e municípios (IBGE)', () => {
  it('lista estados em ordem alfabética', async () => {
    const res = await api().get('/api/locations/states');
    expect(res.status).toBe(200);
    expect(res.body.map((s) => s.uf)).toEqual(['AC', 'MG', 'SP']);
    expect(res.body[1]).toEqual({ uf: 'MG', name: 'Minas Gerais' });
  });

  it('lista municípios do estado e guarda em cache', async () => {
    const a = await api().get('/api/locations/states/mg/cities');
    expect(a.status).toBe(200);
    expect(a.body.map((c) => c.name)).toEqual(['Barbacena', 'Belo Horizonte', 'Pouso Alegre']);
    expect(a.body[2]).toEqual({ ibgeId: 3152501, name: 'Pouso Alegre' });
    await api().get('/api/locations/states/MG/cities');
    expect(calls.filter((c) => c.includes('/estados/MG/municipios'))).toHaveLength(1);
  });

  it('UF inválida -> 400', async () => {
    expect((await api().get('/api/locations/states/MGX/cities')).status).toBe(400);
  });

  it('pedidos simultâneos viram uma chamada só ao IBGE', async () => {
    await Promise.all([1, 2, 3].map(() => api().get('/api/locations/states')));
    expect(calls.filter((c) => c.includes('/estados?'))).toHaveLength(1);
  });

  it('IBGE fora do ar: 503 sem cópia, mas serve a cópia antiga se existir', async () => {
    down = true;
    const fail = await api().get('/api/locations/states');
    expect(fail.status).toBe(503);
    expect(fail.body.code).toBe('IBGE_UNAVAILABLE');

    down = false;
    expect((await api().get('/api/locations/states')).status).toBe(200);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 25 * 3600 * 1000); // cache vencido
    down = true;
    const stale = await api().get('/api/locations/states');
    vi.useRealTimers();
    expect(stale.status).toBe(200);
    expect(stale.body).toHaveLength(3);
  });
});

describe('loja escolhe a cidade pelo código do IBGE', () => {
  const reg = (extra) => api().post('/api/stores/register').send({
    name: `Loja IBGE ${Math.random().toString(36).slice(2, 7)}`, email: `ibge${Math.random().toString(36).slice(2, 9)}@teste.com`,
    password: '123456', phone: '35999999999', ...extra,
  });

  it('cria a cidade na primeira loja e reaproveita nas seguintes', async () => {
    const a = await reg({ ibgeCityId: 3152501 });
    expect(a.status).toBe(201);
    const city = await db('cities').where({ ibge_id: 3152501 }).first();
    expect(city).toMatchObject({ name: 'Pouso Alegre', state: 'MG', slug: 'pouso-alegre-mg' });
    expect((await db('stores').where({ slug: a.body.store.slug }).first()).city_id).toBe(city.id);

    const b = await reg({ ibgeCityId: 3152501 });
    expect(b.status).toBe(201);
    expect(await db('cities').where({ ibge_id: 3152501 }).count({ n: '*' }).first()).toEqual({ n: 1 });
  });

  it('adota a cidade antiga (sem código do IBGE) em vez de duplicar', async () => {
    const old = await createCity({ name: 'São Paulo', state: 'SP', slug: 'sao-paulo-sp' });
    const res = await reg({ ibgeCityId: 3550308 });
    expect(res.status).toBe(201);
    const row = await db('cities').where({ id: old.id }).first();
    expect(row.ibge_id).toBe(3550308);
    expect(await db('cities').where({ state: 'SP' }).count({ n: '*' }).first()).toEqual({ n: 1 });
  });

  it('município que só tem região imediata (sem microrregião) também funciona', async () => {
    expect((await reg({ ibgeCityId: 1100015 })).status).toBe(201);
    expect(await db('cities').where({ ibge_id: 1100015 }).first()).toMatchObject({ state: 'RO' });
  });

  it('código inexistente -> 422; IBGE fora -> 503; sem cidade -> 400', async () => {
    expect((await reg({ ibgeCityId: 999 })).status).toBe(422);
    down = true;
    clearIbgeCache();
    expect((await reg({ ibgeCityId: 3152501 })).status).toBe(503);
    expect((await reg({})).status).toBe(400);
    expect((await reg({ ibgeCityId: 'abc' })).status).toBe(400);
  });

  it('cityId interno continua funcionando (compatibilidade)', async () => {
    const city = await createCity();
    expect((await reg({ cityId: city.id })).status).toBe(201);
    expect((await reg({ cityId: 99999999 })).status).toBe(422);
  });

  it('a loja muda de cidade pelo perfil', async () => {
    const { token } = await registerStore();
    const res = await api().patch('/api/stores/me').set(auth(token)).send({ ibgeCityId: 3550308 });
    expect(res.status).toBe(200);
    const city = await db('cities').where({ ibge_id: 3550308 }).first();
    expect(city.name).toBe('São Paulo');
    expect(res.body.cityId).toBe(city.id);
  });
});

describe('backoffice: cidades que têm loja', () => {
  it('lista só cidades com loja e conta quantas', async () => {
    const withStores = await createCity({ name: 'Com Loja', state: 'MG', slug: 'com-loja-mg' });
    await createCity({ name: 'Sem Loja', state: 'MG', slug: 'sem-loja-mg' });
    await registerStore({ cityId: withStores.id });
    await registerStore({ cityId: withStores.id });
    const { token } = await createAdminUser();

    const res = await api().get('/api/admin/cities').set(auth(token));
    expect(res.status).toBe(200);
    const names = res.body.map((c) => c.name);
    expect(names).toContain('Com Loja');
    expect(names).not.toContain('Sem Loja');
    expect(res.body.find((c) => c.name === 'Com Loja').storesCount).toBe(2);
    expect((await api().get('/api/admin/cities')).status).toBe(401);
  });
});
