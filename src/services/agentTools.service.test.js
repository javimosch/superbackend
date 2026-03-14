jest.mock('mongoose');
jest.mock('child_process', () => ({
  exec: jest.fn()
}));

const { exec } = require('child_process');
const agentToolsService = require('./agentTools.service');

describe('agentTools.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getToolDefinitions', () => {
    test('returns an array of tool definitions', () => {
      const tools = agentToolsService.getToolDefinitions();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    test('each tool has correct OpenAI function format', () => {
      const tools = agentToolsService.getToolDefinitions();
      
      tools.forEach(tool => {
        expect(tool).toHaveProperty('type', 'function');
        expect(tool).toHaveProperty('function');
        expect(tool.function).toHaveProperty('name');
        expect(tool.function).toHaveProperty('description');
        expect(tool.function).toHaveProperty('parameters');
      });
    });

    test('includes expected core tools', () => {
      const tools = agentToolsService.getToolDefinitions();
      const toolNames = tools.map(t => t.function.name);
      
      expect(toolNames).toContain('mongo-memory');
      expect(toolNames).toContain('exec');
      expect(toolNames).toContain('query_database');
    });

    test('mongo-memory tool has correct operations', () => {
      const tools = agentToolsService.getToolDefinitions();
      const mongoTool = tools.find(t => t.function.name === 'mongo-memory');
      
      expect(mongoTool).toBeDefined();
      const operationEnum = mongoTool.function.parameters.properties.operation.enum;
      expect(operationEnum).toContain('list');
      expect(operationEnum).toContain('read');
      expect(operationEnum).toContain('write');
      expect(operationEnum).toContain('append');
      expect(operationEnum).toContain('search');
    });

    test('exec tool has correct parameters', () => {
      const tools = agentToolsService.getToolDefinitions();
      const execTool = tools.find(t => t.function.name === 'exec');
      
      expect(execTool).toBeDefined();
      expect(execTool.function.parameters.properties.command).toBeDefined();
      expect(execTool.function.parameters.properties.command.type).toBe('string');
    });

    test('query_database tool has correct parameters', () => {
      const tools = agentToolsService.getToolDefinitions();
      const dbTool = tools.find(t => t.function.name === 'query_database');
      
      expect(dbTool).toBeDefined();
      expect(dbTool.function.parameters.properties.modelName).toBeDefined();
      expect(dbTool.function.parameters.properties.query).toBeDefined();
    });
  });

  describe('executeTool - exec tool', () => {
    const mockToolContext = {
      orgId: 'test-org',
      userId: 'test-user'
    };

    test('exec tool returns stdout on success', async () => {
      exec.mockImplementation((cmd, cb) => {
        cb(null, { stdout: 'hello world', stderr: '' });
      });
      
      const result = await agentToolsService.executeTool('exec', {
        command: 'echo hello'
      }, mockToolContext);
      
      const parsed = JSON.parse(result);
      expect(parsed.stdout).toBe('hello world');
    });

    test('exec tool returns error response on failure', async () => {
      exec.mockImplementation((cmd, cb) => {
        cb(new Error('Command failed'), { stdout: '', stderr: 'error' });
      });
      
      const result = await agentToolsService.executeTool('exec', {
        command: 'false'
      }, mockToolContext);
      
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
    });

    test('exec tool adds timeout by default', async () => {
      exec.mockImplementation((cmd, cb) => {
        cb(null, { stdout: 'result', stderr: '' });
      });
      
      await agentToolsService.executeTool('exec', {
        command: 'echo test'
      }, mockToolContext);
      
      expect(exec).toHaveBeenCalled();
      const calledCommand = exec.mock.calls[0][0];
      expect(calledCommand).toMatch(/^timeout \d+s /);
    });

    test('exec tool preserves existing timeout', async () => {
      exec.mockImplementation((cmd, cb) => {
        cb(null, { stdout: 'result', stderr: '' });
      });
      
      await agentToolsService.executeTool('exec', {
        command: 'timeout 30s echo test'
      }, mockToolContext);
      
      const calledCommand = exec.mock.calls[0][0];
      expect(calledCommand).toBe('timeout 30s echo test');
    });

    test('returns error for unknown tool', async () => {
      const result = await agentToolsService.executeTool('unknown_tool', {
        command: 'echo test'
      }, mockToolContext);
      
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
      expect(parsed.error.type).toBe('tool_not_found');
    });
  });
});
