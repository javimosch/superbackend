const express = require('express');
const router = express.Router();
const adminTelegramController = require('../controllers/adminTelegram.controller');
const { adminSessionAuth } = require('../middleware/auth');

router.use(adminSessionAuth);

router.get('/', adminTelegramController.listBots);
router.post('/', adminTelegramController.createBot);
router.put('/:id', adminTelegramController.updateBot);
router.delete('/:id', adminTelegramController.deleteBot);
router.post('/:id/toggle', adminTelegramController.toggleBot);

module.exports = router;
