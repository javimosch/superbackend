const Workflow = require('../models/Workflow');
const WorkflowExecution = require('../models/WorkflowExecution');
const llmService = require('./llm.service');
const { NodeVM } = require('vm2');

/**
 * Workflow Service
 * Handles execution of stacked workflow nodes within SuperBackend.
 */
class WorkflowService {
  constructor(workflowId, initialContext = {}) {
    this.workflowId = workflowId;
    
    // Ensure initialContext is a clean object
    const sanitizedContext = (initialContext && typeof initialContext === 'object') ? initialContext : {};
    
    this.context = {
      entrypoint: sanitizedContext,
      payload: sanitizedContext, // for backward compatibility
      nodes: {},
      lastNode: {
        method: sanitizedContext.method,
        body: sanitizedContext.body || {},
        query: sanitizedContext.query || {},
        headers: sanitizedContext.headers || {}
      },
      env: process.env
    };
    this.executionLog = [];
    this.status = 'pending';
    this.startTime = Date.now();
  }

  async runNodeById(workflowId, nodeId, incomingContext) {
    const workflow = await Workflow.findById(workflowId);
    if (!workflow) throw new Error('Workflow not found');
    const node = workflow.nodes.find(n => n.id === nodeId);
    if (!node) throw new Error('Node not found');
    
    // 1. Determine the entrypoint data (priority: incoming context > saved dataset)
    const entrypoint = incomingContext.entrypoint || incomingContext.payload || workflow.testDataset || {};

    // 2. Rebuild the context from scratch to ensure a clean state
    // If incomingContext has lastNode, we use it, otherwise we default to entrypoint
    this.context = {
      ...incomingContext,
      entrypoint: entrypoint,
      payload: entrypoint,
      nodes: incomingContext.nodes || {},
      lastNode: incomingContext.lastNode || {
        method: entrypoint.method || 'POST',
        body: entrypoint.body || {},
        query: entrypoint.query || {},
        headers: entrypoint.headers || {}
      },
      env: process.env
    };

    return await this.executeNode(node);
  }

  async run() {
    const workflow = await Workflow.findById(this.workflowId);
    if (!workflow) throw new Error('Workflow not found');
    
    // Initialize entrypoint and payload if not already set via constructor
    if (!this.context.entrypoint || Object.keys(this.context.entrypoint).length === 0) {
      const entrypoint = workflow.testDataset || {};
      this.context.entrypoint = entrypoint;
      this.context.payload = entrypoint;
      this.context.lastNode = {
        method: entrypoint.method,
        body: entrypoint.body || {},
        query: entrypoint.query || {},
        headers: entrypoint.headers || {}
      };
    }

    this.status = 'running';
    try {
      await this.executeNodes(workflow.nodes);
      this.status = 'completed';
    } catch (err) {
      this.status = 'failed';
      this.executionLog.push({ type: 'error', message: err.message, timestamp: new Date() });
      throw err;
    } finally {
      await this.saveExecution();
    }
  }

  async executeNodes(nodes) {
    for (const node of nodes) {
      await this.executeNode(node);
      if (node.type === 'exit') break;
    }
  }

  async executeNode(node) {
    const nodeStartTime = Date.now();
    let result = null;

    try {
      switch (node.type) {
        case 'llm':
          result = await this.handleLLM(node);
          break;
        case 'if':
          result = await this.handleIf(node);
          break;
        case 'parallel':
          result = await this.handleParallel(node);
          break;
        case 'http':
          result = await this.handleHttp(node);
          break;
        case 'exit':
          result = this.interpolateObject(node.body || {});
          break;
        default:
          throw new Error(`Unknown node type: ${node.type}`);
      }

      // Standardize lastNode as an object
      const standardizedResult = (typeof result !== 'object' || result === null) 
        ? { result: result } 
        : JSON.parse(JSON.stringify(result)); // Deep clone to prevent mutations

      if (node.name) {
        const reserved = new Set(['entrypoint', 'payload', 'nodes', 'lastNode', 'env', 'JSON', 'console', 'context']);
        if (!reserved.has(node.name)) {
          this.context[node.name] = standardizedResult;
        }
      }
      if (node.outputVar) {
        this.context.nodes[node.outputVar] = standardizedResult;
      }
      
      this.context.lastNode = standardizedResult;

      this.executionLog.push({
        nodeId: node.id,
        nodeName: node.name,
        type: node.type,
        duration: Date.now() - nodeStartTime,
        status: 'success',
        result: standardizedResult,
        timestamp: new Date()
      });

      return result;
    } catch (err) {
      this.executionLog.push({
        nodeId: node.id,
        type: node.type,
        status: 'error',
        message: err.message,
        timestamp: new Date()
      });
      throw err;
    }
  }

  async handleLLM(node) {
    const prompt = this.interpolate(node.prompt);
    const response = await llmService.callAdhoc({
      providerKey: node.provider || 'openrouter',
      messages: [{ role: 'user', content: prompt }]
    }, { 
      model: node.model || 'minimax/minimax-m2.1',
      temperature: node.temperature !== undefined ? parseFloat(node.temperature) : 0.7
    });
    return response.content;
  }

  async handleIf(node) {
    const vm = new NodeVM({
      sandbox: { 
        ...this.context,
        context: this.context // for backward compatibility
      },
      timeout: 1000
    });

    const match = vm.run(`module.exports = (${node.condition})`);
    
    // Store branch outcome in context
    this.context[`${node.id}_result`] = match ? 'then' : 'else';

    if (match) {
      return await this.executeNodes(node.then || []);
    } else {
      return await this.executeNodes(node.else || []);
    }
  }

  async handleParallel(node) {
    const results = await Promise.all((node.branches || []).map(branch => this.executeNodes(branch)));
    return results;
  }

  async handleHttp(node) {
    const url = this.interpolate(node.url);
    const response = await fetch(url, {
      method: node.method || 'GET',
      headers: node.headers || {},
      body: node.method !== 'GET' ? JSON.stringify(this.interpolateObject(node.body)) : undefined
    });
    return await response.json();
  }

  interpolate(str) {
    if (!str || typeof str !== 'string') return str;
    return str.replace(/\{\{(.*?)\}\}/gs, (match, jsCode) => {
      try {
        const vm = new NodeVM({
          sandbox: this.context,
          timeout: 1000
        });
        
        const val = vm.run(`module.exports = (${jsCode.trim()})`);
        
        if (val === undefined || val === null) return '';
        return typeof val === 'object' ? JSON.stringify(val) : String(val);
      } catch (err) {
        // Fallback to path resolution if JS eval fails
        const parts = jsCode.trim().split('.');
        let val = this.context;
        for (const part of parts) {
          if (val === null || val === undefined) return match;
          val = val[part];
        }
        if (val === undefined || val === null) return match;
        return typeof val === 'object' ? JSON.stringify(val) : String(val);
      }
    });
  }

  interpolateObject(obj) {
    if (typeof obj === 'string') return this.interpolate(obj);
    if (Array.isArray(obj)) return obj.map(item => this.interpolateObject(item));
    if (typeof obj === 'object' && obj !== null) {
      const result = {};
      for (const key in obj) {
        result[key] = this.interpolateObject(obj[key]);
      }
      return result;
    }
    return obj;
  }

  async saveExecution() {
    await WorkflowExecution.create({
      workflowId: this.workflowId,
      status: this.status,
      context: this.context,
      log: this.executionLog,
      duration: Date.now() - this.startTime,
      executedAt: new Date()
    });
  }
}

module.exports = {
  WorkflowService,
  execute: async (workflowId, initialContext) => {
    const service = new WorkflowService(workflowId, initialContext);
    await service.run();
    return service;
  }
};
