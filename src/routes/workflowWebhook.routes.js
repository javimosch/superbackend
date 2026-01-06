const express = require('express');
const router = express.Router();
const Workflow = require('../models/Workflow');
const workflowService = require('../services/workflow.service');

// Public Webhook Entrypoint
router.all('/:webhookId', async (req, res) => {
  const workflow = await Workflow.findOne({
    $or: [{ _id: req.params.webhookId }, { webhookSlug: req.params.webhookId }]
  });

  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  
  // Method Restriction
  if (workflow.entrypoint?.allowedMethods?.length > 0 && !workflow.entrypoint.allowedMethods.includes(req.method)) {
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  // Auth Checks
  if (workflow.entrypoint?.auth?.type === 'header') {
    const val = req.headers[workflow.entrypoint.auth.headerName?.toLowerCase()];
    if (val !== workflow.entrypoint.auth.headerValue) return res.status(401).json({ error: 'Unauthorized' });
  } else if (workflow.entrypoint?.auth?.type === 'bearer') {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== workflow.entrypoint.auth.headerValue) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (workflow.status !== 'active' && !workflow.entrypoint?.testMode) {
    return res.status(403).json({ error: 'Workflow is inactive' });
  }

  const initialContext = {
    body: req.body,
    query: req.query,
    headers: req.headers,
    method: req.method
  };

  if (workflow.entrypoint?.awaitResponse) {
    try {
      const service = await workflowService.execute(workflow._id, initialContext);
      res.status(200).json(service.context.lastNode || { success: true });
    } catch (err) {
      res.status(500).json({ error: 'Execution failed', message: err.message });
    }
  } else {
    workflowService.execute(workflow._id, initialContext).catch(console.error);
    res.status(201).json({ message: 'Triggered', executionId: Date.now().toString() });
  }
});

module.exports = router;
