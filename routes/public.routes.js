import { Router } from 'express';
import * as Public from '../controllers/public.controller.js';
import { validate } from '../middlewares/validate.js';
import { createOrderValidator } from '../validators/order.validator.js';

const router = Router();

router.get('/stores/:slug/menu', Public.menu);
router.post('/stores/:slug/orders', createOrderValidator, validate, Public.placeOrder);
router.get('/orders/:publicId', Public.trackOrder);

export default router;
