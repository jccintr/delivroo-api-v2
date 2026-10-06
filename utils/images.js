import cloudinary from './cloudinary.js';
import { HttpError } from './errors.js';

// Cada imagem tem um public_id previsível (ex.: delivroo/products/product_12). Assim, enviar uma nova
// imagem SOBRESCREVE a anterior (sem lixo no Cloudinary) e dá para apagar sem guardar o public_id no banco.
export const IMAGE_KINDS = {
  logo:    { folder: 'delivroo/stores',   prefix: 'store',   transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'auto' }, { quality: 'auto', fetch_format: 'auto' }] },
  product: { folder: 'delivroo/products', prefix: 'product', transformation: [{ width: 1000, height: 1000, crop: 'limit' }, { quality: 'auto', fetch_format: 'auto' }] },
  option:  { folder: 'delivroo/options',  prefix: 'option',  transformation: [{ width: 600, height: 600, crop: 'limit' }, { quality: 'auto', fetch_format: 'auto' }] },
};

const fullPublicId = (kind, id) => `${IMAGE_KINDS[kind].folder}/${IMAGE_KINDS[kind].prefix}_${id}`;

function assertConfigured() {
  if (!cloudinary.config().cloud_name) {
    throw new HttpError(503, 'Upload de imagens não configurado no servidor (CLOUDINARY_*).');
  }
}

// Envia o buffer (multer memoryStorage) ao Cloudinary e devolve a URL https.
export async function uploadImage(kind, id, buffer) {
  assertConfigured();
  const { folder, prefix, transformation } = IMAGE_KINDS[kind];
  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id: `${prefix}_${id}`, overwrite: true, invalidate: true, transformation },
      (error, res) => (error ? reject(error) : resolve(res)),
    );
    stream.end(buffer);
  });
  return result.secure_url;
}

// Apaga do Cloudinary sem nunca derrubar a requisição (imagem órfã é só lixo, não erro).
export async function deleteImage(kind, id) {
  try {
    if (!cloudinary.config().cloud_name) return;
    await cloudinary.uploader.destroy(fullPublicId(kind, id), { invalidate: true });
  } catch (err) {
    console.error(`Falha ao apagar imagem ${kind}_${id} no Cloudinary:`, err.message);
  }
}
