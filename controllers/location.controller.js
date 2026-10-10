import { listStates, listMunicipalities } from '../services/ibge.js';

// GET /api/locations/states — estados (UF + nome), vindos do IBGE
export const states = async (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(await listStates());
};

// GET /api/locations/states/:uf/cities — municípios do estado (ibgeId + nome), vindos do IBGE
export const cities = async (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(await listMunicipalities(req.params.uf.toUpperCase()));
};
