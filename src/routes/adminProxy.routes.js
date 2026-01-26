const express = require('express');
const router = express.Router();

const { basicAuth } = require('../middleware/auth');
const controller = require('../controllers/adminProxy.controller');

router.use(basicAuth);

router.get('/entries', controller.list);
router.get('/entries/:id', controller.get);
router.post('/entries', controller.create);
router.put('/entries/:id', controller.update);
router.delete('/entries/:id', controller.delete);

module.exports = router;
