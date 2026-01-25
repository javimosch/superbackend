const Workflow = require('../models/Workflow');
const WorkflowExecution = require('../models/WorkflowExecution');
const { WorkflowService } = require('./workflow.service');
const llmService = require('./llm.service');

jest.mock('../models/Workflow');
jest.mock('../models/WorkflowExecution');
jest.mock('./llm.service');
jest.mock('vm2', () => ({
  NodeVM: jest.fn().mockImplementation((opts) => ({
    run: jest.fn().mockImplementation((code) => {
      // Improved mock logic to handle interpolation
      // matches: module.exports = (val) or module.exports = (user.name)
      const match = code.match(/module\.exports = \(([^)]+)\)/);
      if (match) {
        const path = match[1].trim();
        const parts = path.split('.');
        let val = opts.sandbox;
        for (const part of parts) {
          if (val === undefined || val === null) break;
          val = val[part];
        }
        if (val !== undefined) return val;
      }
      return true;
    })
  }))
}));

describe('workflow.service', () => {
  const mockWorkflowId = '507f1f77bcf86cd799439011';
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WorkflowService(mockWorkflowId);
  });

  describe('constructor', () => {
    test('initializes with default context', () => {
      expect(service.workflowId).toBe(mockWorkflowId);
      expect(service.status).toBe('pending');
      expect(service.context.nodes).toEqual({});
    });

    test('initializes with initial context', () => {
      const initial = { body: { test: 1 } };
      const customService = new WorkflowService(mockWorkflowId, initial);
      expect(customService.context.entrypoint).toEqual(initial);
    });
  });

  describe('interpolate', () => {
    test('interpolates string with context values', () => {
      service.context.user = { name: 'John' };
      // Fallback path resolution test
      const result = service.interpolate('Hello {{user.name}}');
      expect(result).toBe('Hello John');
    });

    test('returns original string if no delimiters', () => {
      expect(service.interpolate('plain string')).toBe('plain string');
    });
  });

  describe('executeNode', () => {
    test('handles exit node', async () => {
      const node = {
        id: 'exit1',
        type: 'exit',
        name: 'final',
        body: { status: 'ok', data: '{{val}}' }
      };
      service.context.val = 'success';

      const result = await service.executeNode(node);

      expect(result).toEqual({ status: 'ok', data: 'success' });
      expect(service.context.lastNode).toEqual({ status: 'ok', data: 'success' });
    });

    test('throws error for unknown node type', async () => {
      const node = { id: 'bad', type: 'unknown' };
      await expect(service.executeNode(node)).rejects.toThrow('Unknown node type');
    });
  });

  describe('handleIf', () => {
    test('executes then-branch when condition is true', async () => {
      const node = {
        id: 'if1',
        type: 'if',
        condition: 'count > 5',
        then: [{ id: 'node1', type: 'exit', body: { result: 'then' } }],
        else: [{ id: 'node2', type: 'exit', body: { result: 'else' } }]
      };
      service.context.count = 10;
      
      const { NodeVM } = require('vm2');
      NodeVM.mockImplementationOnce((opts) => ({
        run: jest.fn().mockReturnValue(true)
      }));

      const result = await service.handleIf(node);
      // In workflow.service.js, handleIf returns the result of executeNodes(node.then)
      // which returns undefined because the last node is 'exit' and result is not returned from executeNodes loop
      expect(service.context['if1_result']).toBe('then');
    });

    test('executes else-branch when condition is false', async () => {
      const node = {
        id: 'if1',
        type: 'if',
        condition: 'count > 5',
        then: [{ id: 'node1', type: 'exit', body: { result: 'then' } }],
        else: [{ id: 'node2', type: 'exit', body: { result: 'else' } }]
      };
      service.context.count = 0;
      
      const { NodeVM } = require('vm2');
      NodeVM.mockImplementationOnce((opts) => ({
        run: jest.fn().mockReturnValue(false)
      }));

      await service.handleIf(node);
      expect(service.context['if1_result']).toBe('else');
    });
  });

  describe('handleHttp', () => {
    test('makes HTTP request and returns JSON response', async () => {
      const node = {
        type: 'http',
        url: 'https://api.test.com/data',
        method: 'POST',
        body: { key: '{{val}}' }
      };
      service.context.val = 'secret';
      
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      const result = await service.handleHttp(node);

      expect(result).toEqual({ success: true });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test.com/data',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ key: 'secret' })
        })
      );
    });
  });

  describe('executeNodes', () => {
    test('executes nodes in sequence', async () => {
      const nodes = [
        { id: 'n1', type: 'llm', prompt: 'prompt1', name: 'node1', provider: 'p1', model: 'm1' },
        { id: 'n2', type: 'llm', prompt: 'prompt2', name: 'node2', provider: 'p2', model: 'm2' }
      ];
      
      llmService.callAdhoc.mockResolvedValueOnce({ content: 'result1' })
                         .mockResolvedValueOnce({ content: 'result2' });
      
      await service.executeNodes(nodes);
      
      expect(service.context.node1).toEqual({ result: 'result1' });
      expect(service.context.node2).toEqual({ result: 'result2' });
      expect(service.context.lastNode).toEqual({ result: 'result2' });
    });

    test('stops execution on exit node', async () => {
      const nodes = [
        { id: 'n1', type: 'exit', body: { a: 1 } },
        { id: 'n2', type: 'exit', body: { b: 2 } }
      ];
      
      // In workflow.service.js, executeNodes checks if node.type === 'exit' to break
      const executeNodeSpy = jest.spyOn(service, 'executeNode');
      
      await service.executeNodes(nodes);
      
      expect(executeNodeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleLLM', () => {
    test('calls llmService with interpolated prompt', async () => {
      const node = {
        type: 'llm',
        prompt: 'Tell me about {{topic}}',
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.7
      };
      service.context.topic = 'AI';
      llmService.callAdhoc.mockResolvedValue({ content: 'AI is great' });

      const result = await service.handleLLM(node);

      expect(result).toBe('AI is great');
      expect(llmService.callAdhoc).toHaveBeenCalledWith(
        {
          providerKey: 'openai',
          messages: [{ role: 'user', content: 'Tell me about AI' }]
        },
        {
          model: 'gpt-4',
          temperature: 0.7
        }
      );
    });
  });

  describe('saveExecution', () => {
    test('creates WorkflowExecution record', async () => {
      await service.saveExecution();
      expect(WorkflowExecution.create).toHaveBeenCalledWith(expect.objectContaining({
        workflowId: mockWorkflowId,
        status: 'pending'
      }));
    });
  });
});
