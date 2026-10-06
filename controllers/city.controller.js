import db from '../db/knex.js';

// GET /api/cities — público, só cidades ativas
export const listActiveCities = async (req, res) => {
  const cities = await db('cities').where({ active: true }).select('id', 'name', 'state', 'slug').orderBy('name');
  res.json(cities);
};
