const express = require('express');
const router = express.Router();

const { adminSessionAuth } = require('../middleware/auth');
const controller = require('../controllers/adminTerminals.controller');

router.use(adminSessionAuth);

router.post('/sessions', controller.createSession);
router.get('/sessions', controller.listSessions);
router.delete('/sessions/:sessionId', controller.killSession);

module.exports = router;
