import db from '../db/knex.js';
import { HttpError } from '../utils/errors.js';
import { slugify } from '../utils/slug.js';
import { getMunicipality } from './ibge.js';

const cityFromMunicipality = (m) => ({ name: m.name, state: m.uf, slug: `${slugify(m.name)}-${m.uf.toLowerCase()}`, ibge_id: m.ibgeId });

/**
 * Devolve o id (tabela `cities`) do município do IBGE, criando a linha se for a primeira loja ali.
 * 1) já existe com esse ibge_id -> usa
 * 2) existe cidade antiga (mesmo slug ou nome+UF) sem ibge_id -> adota (grava o código nela)
 * 3) senão cria
 */
export async function resolveCityId(ibgeId, trx = db) {
  const existing = await trx('cities').where({ ibge_id: ibgeId }).first('id', 'active');
  if (existing) {
    if (!existing.active) throw new HttpError(422, 'Cidade inválida.');
    return existing.id;
  }

  const m = await getMunicipality(ibgeId);
  if (!m) throw new HttpError(422, 'Cidade inválida.');
  const row = cityFromMunicipality(m);

  const legacy = await trx('cities').whereNull('ibge_id')
    .andWhere((q) => q.where({ slug: row.slug }).orWhere({ name: row.name, state: row.state }))
    .first('id', 'active');
  if (legacy) {
    await trx('cities').where({ id: legacy.id }).update({ ibge_id: ibgeId });
    return legacy.id;
  }

  try {
    const [id] = await trx('cities').insert(row);
    return id;
  } catch (err) {
    if (err.code !== 'ER_DUP_ENTRY') throw err;
    // outra requisição criou a mesma cidade agora há pouco
    const again = await trx('cities').where({ ibge_id: ibgeId }).first('id');
    if (again) return again.id;
    throw err;
  }
}
