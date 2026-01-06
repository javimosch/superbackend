const express = require('express');
const router = express.Router();
const Workflow = require('../models/Workflow');
const WorkflowExecution = require('../models/WorkflowExecution');
const workflowService = require('../services/workflow.service');

// List workflows
router.get('/', async (req, res) => {
  const query = req.currentOrganization ? { organizationId: req.currentOrganization.id } : {};
  const workflows = await Workflow.find(query).sort('-createdAt');
  res.json(workflows);
});

// Get single workflow
router.get('/:id', async (req, res) => {
  const workflow = await Workflow.findById(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  res.json(workflow);
});

// Create workflow
router.post('/', async (req, res) => {
  const workflow = await Workflow.create({
    ...req.body,
    organizationId: req.currentOrganization?.id
  });
  res.status(201).json(workflow);
});

// Update workflow
router.put('/:id', async (req, res) => {
  const workflow = await Workflow.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  res.json(workflow);
});

// Delete workflow
router.delete('/:id', async (req, res) => {
  await Workflow.findByIdAndDelete(req.params.id);
  await WorkflowExecution.deleteMany({ workflowId: req.params.id });
  res.json({ success: true });
});

// Get executions
router.get('/:id/runs', async (req, res) => {
  const executions = await WorkflowExecution.find({ workflowId: req.params.id }).sort('-executedAt').limit(50);
  res.json(executions);
});

// Test execution
router.post('/:id/test', async (req, res) => {
  try {
    const initialContext = {
      body: req.body.body || {},
      query: req.body.query || {},
      headers: req.body.headers || {},
      method: req.body.method || 'POST'
    };
    const service = await workflowService.execute(req.params.id, initialContext);
    res.json({
      status: service.status,
      log: service.executionLog,
      context: service.context
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Isolated node test
router.post('/:id/nodes/:nodeId/test', async (req, res) => {
  try {
    const { WorkflowService } = require('../services/workflow.service');
    const Workflow = require('../models/Workflow');
    
    const workflow = await Workflow.findById(req.params.id);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });

    // Use dirty node data from request body if provided, otherwise fallback to DB
    const node = req.body.node || workflow.nodes.find(n => n.id === req.params.nodeId);
    if (!node) return res.status(404).json({ error: 'Node not found' });

    const service = new WorkflowService(req.params.id);
    // Standard runNode logic but with the provided node object
    service.context = {
      ...req.body.context,
      entrypoint: req.body.context?.entrypoint || workflow.testDataset || {},
      payload: req.body.context?.payload || workflow.testDataset || {},
      nodes: req.body.context?.nodes || {},
      lastNode: req.body.context?.lastNode || workflow.testDataset || {},
      env: process.env
    };
    
    const result = await service.executeNode(node);
    
    // Persist result in the node's testResult field in DB
    const nodeIndex = workflow.nodes.findIndex(n => n.id === req.params.nodeId);
    if (nodeIndex !== -1) {
      workflow.nodes[nodeIndex].testResult = result;
      workflow.markModified('nodes');
      await workflow.save();
    }

    res.json({ result, context: service.context });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
