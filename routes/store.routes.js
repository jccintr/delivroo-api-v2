import { Router } from 'express';
import AuthStore from '../middlewares/auth.store.js';
import { validate } from '../middlewares/validate.js';
import * as Store from '../controllers/store.controller.js';
import * as Config from '../controllers/config.controller.js';
import { categories } from '../controllers/category.controller.js';
import * as Product from '../controllers/product.controller.js';
import * as Group from '../controllers/optionGroup.controller.js';
import * as Order from '../controllers/order.controller.js';
import {
  registerStoreValidator, loginValidator, updateProfileValidator, statusValidator,
  deliveryZoneValidator, paymentMethodValidator, businessHoursValidator,
} from '../validators/store.validator.js';
import {
  categoryValidator, createProductValidator, updateProductValidator, createVariantValidator,
  updateVariantValidator, productGroupsValidator, createGroupValidator, updateGroupValidator,
  createOptionValidator, updateOptionValidator,
} from '../validators/catalog.validator.js';
import { changeStatusValidator } from '../validators/order.validator.js';

const router = Router();

// ---- conta (público) ----
router.post('/register', registerStoreValidator, validate, Store.register);
router.post('/login', loginValidator, validate, Store.login);

// ---- tudo abaixo exige login da loja ----
router.use(AuthStore);

router.get('/me', Store.me);
router.patch('/me', updateProfileValidator, validate, Store.updateProfile);
router.patch('/me/status', statusValidator, validate, Store.setOpen);
router.get('/me/business-hours', Store.listBusinessHours);
router.put('/me/business-hours', businessHoursValidator, validate, Store.replaceBusinessHours);

router.get('/delivery-zones', Config.zones.list);
router.post('/delivery-zones', deliveryZoneValidator(false), validate, Config.zones.create);
router.patch('/delivery-zones/:id', deliveryZoneValidator(true), validate, Config.zones.update);
router.delete('/delivery-zones/:id', Config.zones.remove);

router.get('/payment-methods', Config.paymentMethods.list);
router.post('/payment-methods', paymentMethodValidator(false), validate, Config.paymentMethods.create);
router.patch('/payment-methods/:id', paymentMethodValidator(true), validate, Config.paymentMethods.update);
router.delete('/payment-methods/:id', Config.paymentMethods.remove);

router.get('/categories', categories.list);
router.post('/categories', categoryValidator(false), validate, categories.create);
router.patch('/categories/:id', categoryValidator(true), validate, categories.update);
router.delete('/categories/:id', categories.remove);

router.get('/products', Product.list);
router.post('/products', createProductValidator, validate, Product.create);
router.get('/products/:id', Product.get);
router.patch('/products/:id', updateProductValidator, validate, Product.update);
router.delete('/products/:id', Product.remove);
router.post('/products/:id/variants', createVariantValidator, validate, Product.addVariant);
router.patch('/products/:id/variants/:variantId', updateVariantValidator, validate, Product.updateVariant);
router.delete('/products/:id/variants/:variantId', Product.removeVariant);
router.put('/products/:id/option-groups', productGroupsValidator, validate, Product.setOptionGroups);

router.get('/option-groups', Group.list);
router.post('/option-groups', createGroupValidator, validate, Group.create);
router.get('/option-groups/:id', Group.get);
router.patch('/option-groups/:id', updateGroupValidator, validate, Group.update);
router.delete('/option-groups/:id', Group.remove);
router.post('/option-groups/:id/options', createOptionValidator, validate, Group.addOption);
router.patch('/options/:id', updateOptionValidator, validate, Group.updateOption);
router.delete('/options/:id', Group.removeOption);

router.get('/orders', Order.list);
router.get('/orders/:id', Order.get);
router.post('/orders/:id/status', changeStatusValidator, validate, Order.changeStatus);

export default router;
