jest.setTimeout(15000);

const blogAutomationService = require('../services/blogAutomation.service');
const controller = require('./blogAutomationAdmin.controller');

jest.mock('../services/blogAutomation.service', () => ({
  previewPromptsByConfigId: jest.fn(),
  getBlogAutomationConfigs: jest.fn(),
  createAutomationConfig: jest.fn(),
  updateAutomationConfig: jest.fn(),
  getBlogAutomationStyleGuide: jest.fn(),
  updateStyleGuide: jest.fn(),
}));

jest.mock('../services/blogCronsBootstrap.service', () => ({
  bootstrap: jest.fn().mockResolvedValue(true),
}));

describe('blogAutomationAdmin.controller', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = { params: {}, body: {}, query: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('listConfigs', () => {
    test('returns all automation configs', async () => {
      const mockConfigs = { items: [{ id: 'cfg1', name: 'Default' }] };
      blogAutomationService.getBlogAutomationConfigs.mockResolvedValue(mockConfigs);

      await controller.listConfigs(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ configs: mockConfigs });
    });
  });

  describe('createConfig', () => {
    test('creates a new config and bootstraps crons', async () => {
      mockReq.body = { name: 'New Config' };
      const mockCreated = { id: 'cfg2', name: 'New Config' };
      blogAutomationService.createAutomationConfig.mockResolvedValue(mockCreated);

      await controller.createConfig(mockReq, mockRes);

      expect(blogAutomationService.createAutomationConfig).toHaveBeenCalledWith({ name: 'New Config' });
      expect(mockRes.json).toHaveBeenCalledWith({ config: mockCreated });
    });
  });

  describe('style guide management', () => {
    test('getStyleGuide returns current guide', async () => {
      blogAutomationService.getBlogAutomationStyleGuide.mockResolvedValue('Tone: professional');
      await controller.getStyleGuide(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({ styleGuide: 'Tone: professional' });
    });

    test('saveStyleGuide updates current guide', async () => {
      mockReq.body = { styleGuide: 'New Tone' };
      await controller.saveStyleGuide(mockReq, mockRes);
      expect(blogAutomationService.updateStyleGuide).toHaveBeenCalledWith('New Tone');
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('previewPromptsByConfigId', () => {
    test('returns 400 if configId missing', async () => {
      mockReq.params.id = '';

      await controller.previewPromptsByConfigId(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'configId is required' });
      expect(blogAutomationService.previewPromptsByConfigId).not.toHaveBeenCalled();
    });

    test('returns prompts for config', async () => {
      mockReq.params.id = 'cfg1';
      blogAutomationService.previewPromptsByConfigId.mockResolvedValue({ postPrompt: 'p' });

      await controller.previewPromptsByConfigId(mockReq, mockRes);

      expect(blogAutomationService.previewPromptsByConfigId).toHaveBeenCalledWith('cfg1');
      expect(mockRes.json).toHaveBeenCalledWith({ prompts: { postPrompt: 'p' } });
    });

    test('handles service error', async () => {
      mockReq.params.id = 'cfg1';
      blogAutomationService.previewPromptsByConfigId.mockRejectedValue(new Error('boom'));

      await controller.previewPromptsByConfigId(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to preview prompts' });
    });
  });
});
