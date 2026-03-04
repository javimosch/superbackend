const express = require('express');
const router = express.Router();
const adminAgentsController = require('../controllers/adminAgents.controller');
const adminAgentsChatController = require('../controllers/adminAgentsChat.controller');
const { adminSessionAuth } = require('../middleware/auth');

router.use(adminSessionAuth);

router.get('/', adminAgentsController.listAgents);
router.post('/', adminAgentsController.createAgent);
router.put('/:id', adminAgentsController.updateAgent);
router.delete('/:id', adminAgentsController.deleteAgent);

router.post('/chat/session/new', adminAgentsChatController.newSession);
router.get('/chat/sessions', adminAgentsChatController.listSessions);
router.post('/chat/session/rename', adminAgentsChatController.renameSession);
router.post('/chat/session/compact', adminAgentsChatController.compactSession);
router.get('/chat/session/:chatId/messages', adminAgentsChatController.loadSessionMessages);
router.post('/chat/message', adminAgentsChatController.sendMessage);
router.post('/chat/stream', adminAgentsChatController.streamMessage);
router.get('/chat/health', adminAgentsChatController.chatHealth);

module.exports = router;
