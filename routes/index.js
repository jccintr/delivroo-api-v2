import { Router } from 'express';
import storeRoutes from './store.routes.js';
import publicRoutes from './public.routes.js';
import cityRoutes from './city.routes.js';
import adminRoutes from './admin.routes.js';

const router = Router();

router.use('/stores', storeRoutes);
router.use('/public', publicRoutes);
router.use('/cities', cityRoutes);
router.use('/admin', adminRoutes);

export default router;
