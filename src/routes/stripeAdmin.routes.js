const express = require('express');
const router = express.Router();

const { adminSessionAuth } = require('../middleware/auth');
const stripeAdminController = require('../controllers/stripeAdmin.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/status', adminSessionAuth, asyncHandler(stripeAdminController.getStripeStatus));
router.get('/catalog', adminSessionAuth, asyncHandler(stripeAdminController.listCatalog));
router.get('/catalog/:id', adminSessionAuth, asyncHandler(stripeAdminController.getCatalogItem));
router.post('/catalog/upsert', adminSessionAuth, asyncHandler(stripeAdminController.upsertCatalogItem));
router.post('/catalog/import', adminSessionAuth, asyncHandler(stripeAdminController.importStripePrice));
router.post('/catalog/:id/deactivate', adminSessionAuth, asyncHandler(stripeAdminController.deactivateCatalogItem));
router.post('/catalog/:id/activate', adminSessionAuth, asyncHandler(stripeAdminController.activateCatalogItem));
router.delete('/catalog/:id', adminSessionAuth, asyncHandler(stripeAdminController.deleteCatalogItem));
router.get('/products', adminSessionAuth, asyncHandler(stripeAdminController.listStripeProducts));
router.get('/prices', adminSessionAuth, asyncHandler(stripeAdminController.listStripePrices));
router.post('/env/sync', adminSessionAuth, asyncHandler(stripeAdminController.syncEnvFromCatalog));

module.exports = router;
