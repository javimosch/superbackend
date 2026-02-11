const express = require('express');
const router = express.Router();
const adminAgentsController = require('../controllers/adminAgents.controller');
const { basicAuth } = require('../middleware/auth');

router.use(basicAuth);

router.get('/', adminAgentsController.listAgents);
router.post('/', adminAgentsController.createAgent);
router.put('/:id', adminAgentsController.updateAgent);
router.delete('/:id', adminAgentsController.deleteAgent);

module.exports = router;
