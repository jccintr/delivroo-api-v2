import 'dotenv/config'; // garante o .env lido antes de montar o limite abaixo
import multer from 'multer';
import { HttpError } from '../utils/errors.js';

// Tamanho máximo de cada imagem (MB). Altere com IMAGE_MAX_MB no .env (padrão 3).
export const IMAGE_MAX_MB = Number(process.env.IMAGE_MAX_MB) > 0 ? Number(process.env.IMAGE_MAX_MB) : 3;

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

const uploader = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, 'Apenas imagens JPEG, PNG ou WebP são permitidas.'));
  },
  limits: { fileSize: IMAGE_MAX_MB * 1024 * 1024, files: 1 },
});

// uploadImage('logo') lê o arquivo do campo multipart "logo"; uploadImage('image') do campo "image".
export const uploadImage = (field) => uploader.single(field);
