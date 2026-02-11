const express = require('express');
const router = express.Router();
const adminTelegramController = require('../controllers/adminTelegram.controller');
const { basicAuth } = require('../middleware/auth');

router.use(basicAuth);

router.get('/', adminTelegramController.listBots);
router.post('/', adminTelegramController.createBot);
router.put('/:id', adminTelegramController.updateBot);
router.delete('/:id', adminTelegramController.deleteBot);
router.post('/:id/toggle', adminTelegramController.toggleBot);

module.exports = router;
