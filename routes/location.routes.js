import { Router } from 'express';
import { param } from 'express-validator';
import { validate } from '../middlewares/validate.js';
import * as Location from '../controllers/location.controller.js';

const router = Router();
const ufParam = [param('uf').matches(/^[A-Za-z]{2}$/).withMessage('UF inválida')];

router.get('/states', Location.states);
router.get('/states/:uf/cities', ufParam, validate, Location.cities);
export default router;
