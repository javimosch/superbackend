const express = require('express');
const router = express.Router();
const adminAgentsController = require('../controllers/adminAgents.controller');
const { adminSessionAuth } = require('../middleware/auth');

router.use(adminSessionAuth);

router.get('/', adminAgentsController.listAgents);
router.post('/', adminAgentsController.createAgent);
router.put('/:id', adminAgentsController.updateAgent);
router.delete('/:id', adminAgentsController.deleteAgent);

module.exports = router;
