const controller = require('./adminPlugins.controller');
const pluginsService = require('../services/plugins.service');

jest.mock('../services/plugins.service');

describe('adminPlugins.controller', () => {
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

  describe('list', () => {
    test('returns enriched list successfully', async () => {
      const mockItems = [{ id: 'plugin1', name: 'Plugin 1' }, { id: 'plugin2', name: 'Plugin 2' }];
      const mockBootstrapStatus = { plugin1: 'success', plugin2: 'failed' };
      pluginsService.listPlugins.mockResolvedValue(mockItems);
      pluginsService.getBootstrapStatus.mockReturnValue(mockBootstrapStatus);

      await controller.list(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        items: [
          { id: 'plugin1', name: 'Plugin 1', lastBootstrap: 'success' },
          { id: 'plugin2', name: 'Plugin 2', lastBootstrap: 'failed' },
        ],
      });
    });

    test('enriches with null bootstrapStatus when not found', async () => {
      const mockItems = [{ id: 'plugin1', name: 'Plugin 1' }];
      const mockBootstrapStatus = {};
      pluginsService.listPlugins.mockResolvedValue(mockItems);
      pluginsService.getBootstrapStatus.mockReturnValue(mockBootstrapStatus);

      await controller.list(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        items: [{ id: 'plugin1', name: 'Plugin 1', lastBootstrap: null }],
      });
    });

    test('returns 500 when service throws', async () => {
      const error = new Error('Service error');
      pluginsService.listPlugins.mockRejectedValue(error);

      await controller.list(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Service error' });
    });
  });

  describe('enable', () => {
    test('returns result successfully', async () => {
      const mockResult = { enabled: true };
      mockReq.params = { id: 'plugin1' };
      pluginsService.enablePlugin.mockResolvedValue(mockResult);

      await controller.enable(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(mockResult);
      expect(pluginsService.enablePlugin).toHaveBeenCalledWith('plugin1', {
        context: {
          services: {},
          helpers: {},
          request: mockReq,
        },
      });
    });

    test('returns 404 for NOT_FOUND error', async () => {
      const error = new Error('Plugin not found');
      error.code = 'NOT_FOUND';
      mockReq.params = { id: 'plugin1' };
      pluginsService.enablePlugin.mockRejectedValue(error);

      await controller.enable(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Plugin not found' });
    });

    test('returns 400 for VALIDATION error', async () => {
      const error = new Error('Invalid plugin configuration');
      error.code = 'VALIDATION';
      mockReq.params = { id: 'plugin1' };
      pluginsService.enablePlugin.mockRejectedValue(error);

      await controller.enable(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid plugin configuration' });
    });

    test('returns 500 for generic error', async () => {
      const error = new Error('Internal error');
      mockReq.params = { id: 'plugin1' };
      pluginsService.enablePlugin.mockRejectedValue(error);

      await controller.enable(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Internal error' });
    });
  });

  describe('disable', () => {
    test('returns result successfully', async () => {
      const mockResult = { disabled: true };
      mockReq.params = { id: 'plugin1' };
      pluginsService.disablePlugin.mockResolvedValue(mockResult);

      await controller.disable(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(mockResult);
      expect(pluginsService.disablePlugin).toHaveBeenCalledWith('plugin1');
    });

    test('returns 500 on error', async () => {
      const error = new Error('Disable failed');
      mockReq.params = { id: 'plugin1' };
      pluginsService.disablePlugin.mockRejectedValue(error);

      await controller.disable(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Disable failed' });
    });
  });

  describe('install', () => {
    test('returns result successfully', async () => {
      const mockResult = { installed: true };
      mockReq.params = { id: 'plugin1' };
      pluginsService.installPlugin.mockResolvedValue(mockResult);

      await controller.install(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(mockResult);
      expect(pluginsService.installPlugin).toHaveBeenCalledWith('plugin1', {
        context: {
          services: {},
          helpers: {},
          request: mockReq,
        },
      });
    });

    test('returns 500 on error', async () => {
      const error = new Error('Install failed');
      mockReq.params = { id: 'plugin1' };
      pluginsService.installPlugin.mockRejectedValue(error);

      await controller.install(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Install failed' });
    });
  });

  describe('nav', () => {
    test('returns nav items successfully', async () => {
      const mockItems = [{ label: 'Test', path: '/test' }];
      pluginsService.getAdminNavItems.mockReturnValue(mockItems);

      await controller.nav(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ items: mockItems });
      expect(pluginsService.getAdminNavItems).toHaveBeenCalled();
    });

    test('returns 500 on error', async () => {
      const error = new Error('Nav error');
      pluginsService.getAdminNavItems.mockImplementation(() => {
        throw error;
      });

      await controller.nav(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Nav error' });
    });
  });
});
