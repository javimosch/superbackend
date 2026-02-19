const express = require('express');
const router = express.Router();

const { adminSessionAuth } = require('../middleware/auth');
const controller = require('../controllers/adminProxy.controller');

router.use(adminSessionAuth);

router.get('/entries', controller.list);
router.get('/entries/:id', controller.get);
router.post('/entries', controller.create);
router.put('/entries/:id', controller.update);
router.delete('/entries/:id', controller.delete);

module.exports = router;
