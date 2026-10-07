import db from '../db/knex.js';
import { HttpError, notFound } from '../utils/errors.js';
import { loadProduct } from '../services/catalog.service.js';
import { deleteImage, uploadImage } from '../utils/images.js';

const needFile = (req) => {
  if (!req.file) throw new HttpError(400, 'Nenhuma imagem enviada.');
};

// ---- logo da loja --------------------------------------------------------------------------

// PATCH /api/stores/me/logo   (multipart, campo "logo")
export const uploadLogo = async (req, res) => {
  needFile(req);
  const url = await uploadImage('logo', req.user.id, req.file.buffer);
  await db('stores').where({ id: req.user.id }).update({ logo_url: url });
  res.json({ message: 'Logo atualizada com sucesso.', logoUrl: url });
};

// DELETE /api/stores/me/logo
export const removeLogo = async (req, res) => {
  await deleteImage('logo', req.user.id);
  await db('stores').where({ id: req.user.id }).update({ logo_url: null });
  res.status(204).end();
};

// ---- imagem do produto -----------------------------------------------------------------------

// PATCH /api/stores/products/:id/image   (multipart, campo "image")
export const uploadProductImage = async (req, res) => {
  const id = Number(req.params.id);
  await loadProduct(req.user.id, id);
  needFile(req);
  const url = await uploadImage('product', id, req.file.buffer);
  await db('products').where({ id, store_id: req.user.id }).update({ image_url: url });
  res.json({ message: 'Imagem do produto atualizada com sucesso.', imageUrl: url });
};

// DELETE /api/stores/products/:id/image
export const removeProductImage = async (req, res) => {
  const id = Number(req.params.id);
  await loadProduct(req.user.id, id);
  await deleteImage('product', id);
  await db('products').where({ id, store_id: req.user.id }).update({ image_url: null });
  res.status(204).end();
};

// ---- imagem da opção ---------------------------------------------------------------------------

// a opção pertence à loja através do grupo
const findOption = async (storeId, id) => {
  const option = await db('options as o')
    .join('option_groups as g', 'g.id', 'o.group_id')
    .where({ 'o.id': id, 'g.store_id': storeId })
    .first('o.id');
  if (!option) throw notFound('Opção');
  return option;
};

// PATCH /api/stores/options/:id/image   (multipart, campo "image")
export const uploadOptionImage = async (req, res) => {
  const id = Number(req.params.id);
  await findOption(req.user.id, id);
  needFile(req);
  const url = await uploadImage('option', id, req.file.buffer);
  await db('options').where({ id }).update({ image_url: url });
  res.json({ message: 'Imagem da opção atualizada com sucesso.', imageUrl: url });
};

// DELETE /api/stores/options/:id/image
export const removeOptionImage = async (req, res) => {
  const id = Number(req.params.id);
  await findOption(req.user.id, id);
  await deleteImage('option', id);
  await db('options').where({ id }).update({ image_url: null });
  res.status(204).end();
};
