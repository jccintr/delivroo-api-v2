import { describe, it, expect, vi, beforeEach } from 'vitest';
import db from '../db/knex.js';
import cloudinary from '../utils/cloudinary.js';
import { api, auth, registerStore, seedPizzaria } from './factories/helpers.js';

vi.mock('../utils/cloudinary.js', async () => ({ default: (await import('./mocks/cloudinary.js')).default }));

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

beforeEach(() => vi.clearAllMocks());

const mkProduct = async (token) => {
  const cat = (await api().post('/api/stores/categories').set(auth(token)).send({ name: 'Lanches' })).body;
  return (await api().post('/api/stores/products').set(auth(token)).send({ categoryId: cat.id, name: 'X-Tudo', variants: [{ name: 'Único', priceCents: 2500 }] })).body;
};

describe('Logo da loja', () => {
  it('exige login', async () => {
    expect((await api().patch('/api/stores/me/logo')).status).toBe(401);
  });

  it('400 sem arquivo', async () => {
    const { token } = await registerStore();
    const res = await api().patch('/api/stores/me/logo').set(auth(token));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Nenhuma imagem enviada.');
  });

  it('400 para arquivo que não é imagem', async () => {
    const { token } = await registerStore();
    const res = await api().patch('/api/stores/me/logo').set(auth(token)).attach('logo', Buffer.from('texto'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/JPEG, PNG ou WebP/);
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
  });

  it('400 para arquivo maior que 2 MB', async () => {
    const { token } = await registerStore();
    const big = Buffer.alloc(2 * 1024 * 1024 + 10, 1);
    const res = await api().patch('/api/stores/me/logo').set(auth(token)).attach('logo', big, { filename: 'g.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Imagem muito grande. Máximo 2 MB.');
  });

  it('envia, grava logo_url e aparece no perfil e no cardápio público', async () => {
    const { token, store } = await registerStore();
    const res = await api().patch('/api/stores/me/logo').set(auth(token)).attach('logo', PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.logoUrl).toBe(`https://res.cloudinary.com/demo/image/upload/v1/delivroo/stores/store_${store.id}.jpg`);

    const [opts] = cloudinary.uploader.upload_stream.mock.calls[0];
    expect(opts).toMatchObject({ folder: 'delivroo/stores', public_id: `store_${store.id}`, overwrite: true });

    expect((await api().get('/api/stores/me').set(auth(token))).body.logoUrl).toBe(res.body.logoUrl);
    const menu = await api().get(`/api/public/stores/${store.slug}/menu`);
    expect(menu.body.store.logoUrl).toBe(res.body.logoUrl);
  });

  it('500 quando o Cloudinary falha', async () => {
    cloudinary.uploader.upload_stream.mockImplementationOnce((o, cb) => ({ end: () => cb(new Error('boom'), null) }));
    const { token } = await registerStore();
    const res = await api().patch('/api/stores/me/logo').set(auth(token)).attach('logo', PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(res.status).toBe(500);
  });

  it('remove a logo (banco e Cloudinary)', async () => {
    const { token, store } = await registerStore();
    await api().patch('/api/stores/me/logo').set(auth(token)).attach('logo', PNG, { filename: 'logo.png', contentType: 'image/png' }).expect(200);
    await api().delete('/api/stores/me/logo').set(auth(token)).expect(204);
    expect((await api().get('/api/stores/me').set(auth(token))).body.logoUrl).toBeNull();
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(`delivroo/stores/store_${store.id}`, expect.anything());
  });
});

describe('Imagem do produto', () => {
  it('envia, aparece na listagem e no cardápio, e some ao remover', async () => {
    const { token, store } = await registerStore();
    const product = await mkProduct(token);

    const res = await api().patch(`/api/stores/products/${product.id}/image`).set(auth(token)).attach('image', PNG, { filename: 'p.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toContain(`delivroo/products/product_${product.id}`);

    expect((await api().get(`/api/stores/products/${product.id}`).set(auth(token))).body.imageUrl).toBe(res.body.imageUrl);
    const menu = await api().get(`/api/public/stores/${store.slug}/menu`);
    expect(menu.body.categories[0].products[0].imageUrl).toBe(res.body.imageUrl);

    await api().delete(`/api/stores/products/${product.id}/image`).set(auth(token)).expect(204);
    expect((await api().get(`/api/stores/products/${product.id}`).set(auth(token))).body.imageUrl).toBeNull();
  });

  it('404 para produto de outra loja e nada é enviado ao Cloudinary', async () => {
    const a = await registerStore();
    const b = await registerStore();
    const product = await mkProduct(a.token);
    const res = await api().patch(`/api/stores/products/${product.id}/image`).set(auth(b.token)).attach('image', PNG, { filename: 'p.png', contentType: 'image/png' });
    expect(res.status).toBe(404);
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
  });

  it('400 sem arquivo', async () => {
    const { token } = await registerStore();
    const product = await mkProduct(token);
    expect((await api().patch(`/api/stores/products/${product.id}/image`).set(auth(token))).status).toBe(400);
  });

  it('apagar o produto apaga a imagem no Cloudinary', async () => {
    const { token } = await registerStore();
    const product = await mkProduct(token);
    await api().patch(`/api/stores/products/${product.id}/image`).set(auth(token)).attach('image', PNG, { filename: 'p.png', contentType: 'image/png' }).expect(200);
    await api().delete(`/api/stores/products/${product.id}`).set(auth(token)).expect(204);
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(`delivroo/products/product_${product.id}`, expect.anything());
  });

  it('falha ao apagar no Cloudinary não derruba a requisição', async () => {
    cloudinary.uploader.destroy.mockRejectedValueOnce(new Error('rede'));
    const { token } = await registerStore();
    const product = await mkProduct(token);
    await api().delete(`/api/stores/products/${product.id}/image`).set(auth(token)).expect(204);
  });
});

describe('Imagem da opção', () => {
  it('envia/remove e respeita o isolamento entre lojas', async () => {
    const a = await registerStore();
    const ids = await seedPizzaria(a.token);
    const groups = (await api().get('/api/stores/option-groups').set(auth(a.token))).body;
    const optionId = groups[0].options[0].id;

    const b = await registerStore();
    expect((await api().patch(`/api/stores/options/${optionId}/image`).set(auth(b.token)).attach('image', PNG, { filename: 'o.png', contentType: 'image/png' })).status).toBe(404);

    const res = await api().patch(`/api/stores/options/${optionId}/image`).set(auth(a.token)).attach('image', PNG, { filename: 'o.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toContain(`delivroo/options/option_${optionId}`);
    expect((await api().get(`/api/stores/option-groups/${groups[0].id}`).set(auth(a.token))).body.options.find((o) => o.id === optionId).imageUrl).toBe(res.body.imageUrl);

    await api().delete(`/api/stores/options/${optionId}/image`).set(auth(a.token)).expect(204);
    expect((await db('options').where({ id: optionId }).first()).image_url).toBeNull();
    expect(ids).toBeTruthy();
  });

  it('apagar o grupo apaga as imagens das opções', async () => {
    const { token } = await registerStore();
    const group = (await api().post('/api/stores/option-groups').set(auth(token)).send({ name: 'Borda', options: [{ name: 'Catupiry' }] })).body;
    const optionId = group.options[0].id;
    await api().patch(`/api/stores/options/${optionId}/image`).set(auth(token)).attach('image', PNG, { filename: 'o.png', contentType: 'image/png' }).expect(200);
    await api().delete(`/api/stores/option-groups/${group.id}`).set(auth(token)).expect(204);
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(`delivroo/options/option_${optionId}`, expect.anything());
  });
});
