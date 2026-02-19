const express = require('express');

const { adminSessionAuth } = require('../middleware/auth');
const controller = require('../controllers/adminRegistry.controller');

const router = express.Router();

router.use(adminSessionAuth);

router.get('/', controller.listRegistries);
router.post('/', controller.createRegistry);
router.get('/:id', controller.getRegistry);
router.put('/:id', controller.updateRegistry);
router.delete('/:id', controller.deleteRegistry);

router.get('/:id/items', controller.listItems);
router.post('/:id/items', controller.upsertItem);
router.put('/:id/items/:itemId', controller.upsertItem);
router.delete('/:id/items/:itemId', controller.deleteItem);

router.post('/:id/tokens', controller.createToken);
router.delete('/:id/tokens/:tokenId', controller.deleteToken);

module.exports = router;
