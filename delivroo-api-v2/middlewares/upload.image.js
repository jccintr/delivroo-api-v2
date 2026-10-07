import multer from 'multer';
import { HttpError } from '../utils/errors.js';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

const uploader = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, 'Apenas imagens JPEG, PNG ou WebP são permitidas.'));
  },
  limits: { fileSize: 2 * 1024 * 1024, files: 1 }, // 2 MB
});

// uploadImage('logo') lê o arquivo do campo multipart "logo"; uploadImage('image') do campo "image".
export const uploadImage = (field) => uploader.single(field);
