// Cliente da API de Localidades do IBGE (gratuita, sem chave) com cache em memória.
//   estados:    GET /api/v1/localidades/estados?orderBy=nome
//   municípios: GET /api/v1/localidades/estados/{UF}/municipios?orderBy=nome
//   município:  GET /api/v1/localidades/municipios/{id}
//
// O cache vive na memória do processo (some ao reiniciar; cada instância tem o seu). Se o IBGE falhar
// e houver cópia antiga, devolvemos a cópia antiga em vez de derrubar o cadastro.
import { HttpError } from '../utils/errors.js';

const BASE = process.env.IBGE_API_URL || 'https://servicodados.ibge.gov.br/api/v1/localidades';
const TTL_MS = Number(process.env.IBGE_CACHE_TTL_MS) || 24 * 3600 * 1000;
const TIMEOUT_MS = Number(process.env.IBGE_TIMEOUT_MS) || 5000;

const cache = new Map();    // chave -> { value, expires }
const inflight = new Map(); // chave -> Promise (evita 50 pedidos iguais ao mesmo tempo)

export const clearIbgeCache = () => { cache.clear(); inflight.clear(); };

async function fetchJson(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`IBGE respondeu ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function cached(key, path, map) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    try {
      const value = map(await fetchJson(path));
      cache.set(key, { value, expires: Date.now() + TTL_MS });
      return value;
    } catch (err) {
      if (hit) return hit.value; // IBGE fora do ar: melhor dado velho do que nenhum
      throw new HttpError(503, 'Não foi possível consultar a lista de cidades agora. Tente novamente em instantes.', { code: 'IBGE_UNAVAILABLE' });
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export const listStates = () => cached('states', '/estados?orderBy=nome', (rows) =>
  rows.map((s) => ({ uf: s.sigla, name: s.nome })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));

export const listMunicipalities = (uf) => cached(`cities:${uf}`, `/estados/${uf}/municipios?orderBy=nome`, (rows) =>
  rows.map((m) => ({ ibgeId: m.id, name: m.nome })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));

// Um município pelo código do IBGE (null se não existir).
export async function getMunicipality(ibgeId) {
  const key = `city:${ibgeId}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  try {
    const raw = await fetchJson(`/municipios/${ibgeId}`);
    const m = Array.isArray(raw) ? raw[0] : raw;
    const uf = m?.microrregiao?.mesorregiao?.UF?.sigla
      ?? m?.['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla;
    const value = m && uf ? { ibgeId: m.id, name: m.nome, uf } : null;
    cache.set(key, { value, expires: Date.now() + TTL_MS });
    return value;
  } catch {
    if (hit) return hit.value;
    throw new HttpError(503, 'Não foi possível consultar a lista de cidades agora. Tente novamente em instantes.', { code: 'IBGE_UNAVAILABLE' });
  }
}
