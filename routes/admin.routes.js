import { Router } from 'express';
import AuthAdmin from '../middlewares/auth.admin.js';
import { validate } from '../middlewares/validate.js';
import * as Admin from '../controllers/admin.controller.js';
import * as Stores from '../controllers/admin.stores.controller.js';
import {
  adminLoginValidator, changePasswordValidator, listStoresValidator, storeIdParam, setActiveValidator, auditLogValidator,
} from '../validators/admin.validator.js';

// Backoffice (admin geral). Segredo JWT próprio; nenhuma rota daqui mexe no cardápio da loja.
const router = Router();

router.post('/login', adminLoginValidator, validate, Admin.login);

// ---- tudo abaixo exige login de admin ----
router.use(AuthAdmin);

router.get('/me', Admin.me);
router.patch('/me/password', changePasswordValidator, validate, Admin.changePassword);

router.get('/stores', listStoresValidator, validate, Stores.list);
router.get('/stores/:id', storeIdParam, validate, Stores.get);
router.patch('/stores/:id/active', setActiveValidator, validate, Stores.setActive);

router.get('/audit-log', auditLogValidator, validate, Stores.auditLog);

export default router;
