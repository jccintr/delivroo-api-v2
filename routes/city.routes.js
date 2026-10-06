import { Router } from 'express';
import { listActiveCities } from '../controllers/city.controller.js';

const router = Router();
router.get('/', listActiveCities);
export default router;
