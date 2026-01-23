const express = require('express');
const router = express.Router();

const { basicAuth } = require('../middleware/auth');
const controller = require('../controllers/adminTerminals.controller');

router.use(basicAuth);

router.post('/sessions', controller.createSession);
router.get('/sessions', controller.listSessions);
router.delete('/sessions/:sessionId', controller.killSession);

module.exports = router;
