const controller = require('./adminBlockDefinitionsAi.controller');
const blockDefinitionsAi = require('../services/blockDefinitionsAi.service');
const audit = require('../services/audit.service');

jest.mock('../services/blockDefinitionsAi.service');
jest.mock('../services/audit.service');

describe('adminBlockDefinitionsAi.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      body: {},
      params: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('generate', () => {
    test('returns result successfully', async () => {
      const mockResult = { blockDefinition: 'test' };
      mockReq.body = { prompt: 'test prompt', providerKey: 'openai', model: 'gpt-4' };
      blockDefinitionsAi.generateBlockDefinition.mockResolvedValue(mockResult);
      audit.getBasicAuthActor.mockReturnValue({ id: 'user1' });

      await controller.generate(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(mockResult);
      expect(blockDefinitionsAi.generateBlockDefinition).toHaveBeenCalledWith({
        prompt: 'test prompt',
        providerKey: 'openai',
        model: 'gpt-4',
        actor: { id: 'user1' },
      });
    });

    test('returns 400 for VALIDATION error', async () => {
      const error = new Error('Validation failed');
      error.code = 'VALIDATION';
      mockReq.body = { prompt: 'test' };
      blockDefinitionsAi.generateBlockDefinition.mockRejectedValue(error);
      audit.getBasicAuthActor.mockReturnValue({ id: 'user1' });

      await controller.generate(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Validation failed' });
    });

    test('returns 404 for NOT_FOUND error', async () => {
      const error = new Error('Not found');
      error.code = 'NOT_FOUND';
      mockReq.body = { prompt: 'test' };
      blockDefinitionsAi.generateBlockDefinition.mockRejectedValue(error);
      audit.getBasicAuthActor.mockReturnValue({ id: 'user1' });

      await controller.generate(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Not found' });
    });

    test('returns 500 for AI_INVALID error', async () => {
      const error = new Error('AI invalid');
      error.code = 'AI_INVALID';
      mockReq.body = { prompt: 'test' };
      blockDefinitionsAi.generateBlockDefinition.mockRejectedValue(error);
      audit.getBasicAuthActor.mockReturnValue({ id: 'user1' });

      await controller.generate(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'AI invalid' });
    });

    test('returns 500 for unknown error', async () => {
      const error = new Error('Unknown error');
      mockReq.body = { prompt: 'test' };
      blockDefinitionsAi.generateBlockDefinition.mockRejectedValue(error);
      audit.getBasicAuthActor.mockReturnValue({ id: 'user1' });

      await controller.generate(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Unknown error' });
    });

    test('returns 500 for error without message', async () => {
      const error = {};
      mockReq.body = { prompt: 'test' };
      blockDefinitionsAi.generateBlockDefinition.mockRejectedValue(error);
      audit.getBasicAuthActor.mockReturnValue({ id: 'user1' });

      await controller.generate(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Operation failed' });
    });
  });

  describe('propose', () => {
    test('returns result successfully', async () => {
      const mockResult = { proposedEdit: 'test' };
      mockReq.params = { code: 'test-block' };
      mockReq.body = { prompt: 'edit prompt', providerKey: 'openai', model: 'gpt-4' };
      blockDefinitionsAi.proposeBlockDefinitionEdit.mockResolvedValue(mockResult);
      audit.getBasicAuthActor.mockReturnValue({ id: 'user1' });

      await controller.propose(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(mockResult);
      expect(blockDefinitionsAi.proposeBlockDefinitionEdit).toHaveBeenCalledWith({
        code: 'test-block',
        prompt: 'edit prompt',
        providerKey: 'openai',
        model: 'gpt-4',
        actor: { id: 'user1' },
      });
    });

    test('returns 400 for VALIDATION error', async () => {
      const error = new Error('Validation failed');
      error.code = 'VALIDATION';
      mockReq.params = { code: 'test-block' };
      mockReq.body = { prompt: 'test' };
      blockDefinitionsAi.proposeBlockDefinitionEdit.mockRejectedValue(error);
      audit.getBasicAuthActor.mockReturnValue({ id: 'user1' });

      await controller.propose(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Validation failed' });
    });

    test('returns 404 for NOT_FOUND error', async () => {
      const error = new Error('Not found');
      error.code = 'NOT_FOUND';
      mockReq.params = { code: 'test-block' };
      mockReq.body = { prompt: 'test' };
      blockDefinitionsAi.proposeBlockDefinitionEdit.mockRejectedValue(error);
      audit.getBasicAuthActor.mockReturnValue({ id: 'user1' });

      await controller.propose(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Not found' });
    });

    test('returns 500 for AI_INVALID error', async () => {
      const error = new Error('AI invalid');
      error.code = 'AI_INVALID';
      mockReq.params = { code: 'test-block' };
      mockReq.body = { prompt: 'test' };
      blockDefinitionsAi.proposeBlockDefinitionEdit.mockRejectedValue(error);
      audit.getBasicAuthActor.mockReturnValue({ id: 'user1' });

      await controller.propose(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'AI invalid' });
    });

    test('returns 500 for unknown error', async () => {
      const error = new Error('Unknown error');
      mockReq.params = { code: 'test-block' };
      mockReq.body = { prompt: 'test' };
      blockDefinitionsAi.proposeBlockDefinitionEdit.mockRejectedValue(error);
      audit.getBasicAuthActor.mockReturnValue({ id: 'user1' });

      await controller.propose(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Unknown error' });
    });

    test('returns 500 for error without message', async () => {
      const error = {};
      mockReq.params = { code: 'test-block' };
      mockReq.body = { prompt: 'test' };
      blockDefinitionsAi.proposeBlockDefinitionEdit.mockRejectedValue(error);
      audit.getBasicAuthActor.mockReturnValue({ id: 'user1' });

      await controller.propose(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Operation failed' });
    });
  });
});
