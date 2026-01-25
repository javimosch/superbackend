const controller = require('./adminLlm.controller');
const GlobalSetting = require('../models/GlobalSetting');
const AuditEvent = require('../models/AuditEvent');
const llmService = require('../services/llm.service');
const { encryptString, decryptString } = require('../utils/encryption');
const axios = require('axios');

jest.mock('../models/GlobalSetting');
jest.mock('../models/AuditEvent');
jest.mock('../services/llm.service');
jest.mock('../utils/encryption');
jest.mock('axios');

describe('adminLlm.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      params: {},
      body: {},
      query: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('getConfig', () => {
    test('returns all LLM related configurations', async () => {
      GlobalSetting.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValueOnce({ value: JSON.stringify({ openai: { apiKey: 'masked' } }) }) // providers
          .mockResolvedValueOnce({ value: JSON.stringify({ prompt1: 'template' }) }) // prompts
          .mockResolvedValueOnce({ value: 'openai' }) // defaults.providerKey
          .mockResolvedValueOnce({ value: 'gpt-4' }) // defaults.model
          .mockResolvedValueOnce({ value: JSON.stringify({ system1: {} }) }) // systemDefaults
          .mockResolvedValueOnce({ value: JSON.stringify({ model1: {} }) }) // providerModels
      });

      await controller.getConfig(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        providers: expect.any(Object),
        prompts: expect.any(Object),
        defaults: expect.objectContaining({ providerKey: 'openai', model: 'gpt-4' })
      }));
    });
  });

  describe('saveConfig', () => {
    test('saves providers and updates settings', async () => {
      mockReq.body = {
        providers: { openai: { apiKey: 'new-key', other: 'val' } },
        defaults: { providerKey: 'openai', model: 'gpt-4' }
      };

      encryptString.mockReturnValue({ ciphertext: 'encrypted' });
      GlobalSetting.findOne.mockResolvedValue(null);
      GlobalSetting.prototype.save = jest.fn().mockResolvedValue(true);

      await controller.saveConfig(mockReq, mockRes);

      expect(encryptString).toHaveBeenCalledWith('new-key');
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('listOpenRouterModels', () => {
    test('fetches and returns models from OpenRouter API', async () => {
      GlobalSetting.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ value: '{"ciphertext":"key"}' }) });
      decryptString.mockReturnValue('decrypted-key');
      
      axios.get.mockResolvedValue({ data: { data: [{ id: 'model-1' }, { id: 'model-2' }] } });

      await controller.listOpenRouterModels(mockReq, mockRes);

      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('openrouter.ai'), expect.any(Object));
      expect(mockRes.json).toHaveBeenCalledWith({ models: ['model-1', 'model-2'] });
    });
  });

  describe('testPrompt', () => {
    test('calls llmService.testPrompt and returns result', async () => {
      mockReq.params.key = 'test-prompt';
      mockReq.body = { variables: { name: 'John' }, options: {} };
      
      llmService.testPrompt.mockResolvedValue({ content: 'AI Response' });

      await controller.testPrompt(mockReq, mockRes);

      expect(llmService.testPrompt).toHaveBeenCalledWith(
        { key: 'test-prompt' },
        { name: 'John' },
        {}
      );
      expect(mockRes.json).toHaveBeenCalledWith({ result: { content: 'AI Response' } });
    });
  });

  describe('listAudit', () => {
    test('returns paginated LLM completion audit events', async () => {
      mockReq.query = { page: '1', pageSize: '10', status: 'success' };
      const mockEvents = [{ _id: 'a1', meta: { promptKey: 'p1' } }];
      
      AuditEvent.countDocuments.mockResolvedValue(1);
      AuditEvent.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockEvents)
      });

      await controller.listAudit(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        items: mockEvents,
        total: 1
      }));
    });
  });

  describe('listCosts', () => {
    test('returns usage and cost reports', async () => {
      mockReq.query = { page: '1', pageSize: '20' };
      const mockEvents = [
        { _id: 'a1', meta: { usage: { prompt_tokens: 100, completion_tokens: 50 }, providerKey: 'p1', model: 'm1' } }
      ];
      
      AuditEvent.countDocuments.mockResolvedValue(1);
      AuditEvent.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockEvents)
      });
      GlobalSetting.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ value: '{}' }) });

      await controller.listCosts(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        items: expect.any(Array),
        total: 1
      }));
    });
  });
});
