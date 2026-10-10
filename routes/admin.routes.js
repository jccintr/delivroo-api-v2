import { Router } from 'express';
import AuthAdmin from '../middlewares/auth.admin.js';
import { validate } from '../middlewares/validate.js';
import * as Admin from '../controllers/admin.controller.js';
import * as Stores from '../controllers/admin.stores.controller.js';
import * as Billing from '../controllers/admin.billing.controller.js';
import {
  adminLoginValidator, changePasswordValidator, listStoresValidator, storeIdParam, setActiveValidator, auditLogValidator,
} from '../validators/admin.validator.js';
import {
  createPlanValidator, updatePlanValidator, planIdParam, adminSetPlanValidator, extendTrialValidator, courtesyValidator,
  payInvoiceValidator, voidInvoiceValidator, listInvoicesValidator,
} from '../validators/billing.validator.js';

// Backoffice (admin geral). Segredo JWT próprio; nenhuma rota daqui mexe no cardápio da loja.
const router = Router();

router.post('/login', adminLoginValidator, validate, Admin.login);

// ---- tudo abaixo exige login de admin ----
router.use(AuthAdmin);

router.get('/me', Admin.me);
router.patch('/me/password', changePasswordValidator, validate, Admin.changePassword);

router.get('/cities', Stores.citiesWithStores);
router.get('/stores', listStoresValidator, validate, Stores.list);
router.get('/stores/:id', storeIdParam, validate, Stores.get);
router.patch('/stores/:id/active', setActiveValidator, validate, Stores.setActive);

router.get('/stores/:id/subscription', storeIdParam, validate, Billing.getSubscription);
router.put('/stores/:id/subscription/plan', adminSetPlanValidator, validate, Billing.putPlan);
router.post('/stores/:id/subscription/extend-trial', extendTrialValidator, validate, Billing.postExtendTrial);
router.put('/stores/:id/subscription/courtesy', courtesyValidator, validate, Billing.putCourtesy);
router.post('/stores/:id/invoices/:invoiceId/pay', payInvoiceValidator, validate, Billing.payInvoice);
router.post('/stores/:id/invoices/:invoiceId/void', voidInvoiceValidator, validate, Billing.cancelInvoice);

router.get('/invoices', listInvoicesValidator, validate, Billing.listInvoices);

router.get('/plans', Billing.listPlans);
router.post('/plans', createPlanValidator, validate, Billing.createPlan);
router.patch('/plans/:id', updatePlanValidator, validate, Billing.updatePlan);
router.delete('/plans/:id', planIdParam, validate, Billing.deletePlan);

router.get('/audit-log', auditLogValidator, validate, Stores.auditLog);

export default router;
