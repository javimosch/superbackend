const express = require('express');
const router = express.Router();
const { adminSessionAuth } = require('../middleware/auth');

const adminJsonConfigsController = require('../controllers/adminJsonConfigs.controller');

router.get('/', adminSessionAuth, adminJsonConfigsController.list);
router.get('/:id', adminSessionAuth, adminJsonConfigsController.get);
router.post('/', adminSessionAuth, adminJsonConfigsController.create);
router.put('/:id', adminSessionAuth, adminJsonConfigsController.update);
router.post('/:id/regenerate-slug', adminSessionAuth, adminJsonConfigsController.regenerateSlug);
router.post('/:id/clear-cache', adminSessionAuth, adminJsonConfigsController.clearCache);
router.delete('/:id', adminSessionAuth, adminJsonConfigsController.remove);

module.exports = router;
