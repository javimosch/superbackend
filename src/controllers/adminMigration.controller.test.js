const controller = require('./adminMigration.controller');
const migrationService = require('../services/migration.service');
const mongoose = require('mongoose');

jest.mock('../services/migration.service');

describe('adminMigration.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      query: {},
      body: {},
      params: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    
    // Clear global registries
    delete globalThis.superbackend;
    delete globalThis.saasbackend;
  });

  describe('listEnvironments', () => {
    test('returns environments list', async () => {
      const mockEnvs = [{ key: 'prod', name: 'Production' }];
      migrationService.listEnvironments.mockResolvedValue(mockEnvs);

      await controller.listEnvironments(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ environments: mockEnvs });
    });

    test('returns full environment config if envKey provided', async () => {
      mockReq.query = { envKey: 'prod', include: 'full' };
      const mockEnv = { key: 'prod', name: 'Production', connectionString: '...' };
      migrationService.getEnvironmentConfig.mockResolvedValue(mockEnv);

      await controller.listEnvironments(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ environment: mockEnv, environments: [mockEnv] });
    });
  });

  describe('listModels', () => {
    test('returns sorted model names from registry', async () => {
      globalThis.superbackend = {
        models: {
          User: {},
          Organization: {}
        }
      };

      await controller.listModels(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ models: ['Organization', 'User'] });
    });

    test('returns 500 if registry missing', async () => {
      await controller.listModels(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getModelSchema', () => {
    test('returns schema description for model', async () => {
      mockReq.params.modelName = 'User';
      const mockModel = {
        modelName: 'User',
        schema: {
          paths: {
            email: { instance: 'String', validators: [{ type: 'required' }] },
            role: { instance: 'String', options: { enum: ['user', 'admin'] } }
          }
        }
      };
      globalThis.superbackend = { models: { User: mockModel } };

      await controller.getModelSchema(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        schema: expect.objectContaining({
          modelName: 'User',
          fields: expect.arrayContaining([
            expect.objectContaining({ key: 'email', type: 'String', required: true }),
            expect.objectContaining({ key: 'role', enumValues: ['user', 'admin'] })
          ])
        })
      });
    });
  });

  describe('runMigration', () => {
    test('calls migrateModel with correct params', async () => {
      mockReq.body = { envKey: 'prod', modelName: 'User', dryRun: true };
      const mockModel = { modelName: 'User' };
      globalThis.superbackend = { models: { User: mockModel } };
      migrationService.migrateModel.mockResolvedValue({ success: true });

      await controller.runMigration(mockReq, mockRes);

      expect(migrationService.migrateModel).toHaveBeenCalledWith(expect.objectContaining({
        sourceModel: mockModel,
        targetEnvKey: 'prod',
        dryRun: true
      }));
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('Environment CRUD', () => {
    test('upsertEnvironment saves environment config', async () => {
      mockReq.body = { envKey: 'staging', name: 'Staging', connectionString: 'mongodb://...' };
      const mockSaved = { key: 'staging', name: 'Staging' };
      migrationService.upsertEnvironment.mockResolvedValue(mockSaved);

      await controller.upsertEnvironment(mockReq, mockRes);

      expect(migrationService.upsertEnvironment).toHaveBeenCalledWith('staging', expect.any(Object));
      expect(mockRes.json).toHaveBeenCalledWith({ environment: mockSaved });
    });

    test('getEnvironment returns specific env', async () => {
      mockReq.params.envKey = 'staging';
      const mockEnv = { key: 'staging', name: 'Staging' };
      migrationService.getEnvironmentConfig.mockResolvedValue(mockEnv);

      await controller.getEnvironment(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ environment: mockEnv });
    });

    test('deleteEnvironment removes env', async () => {
      mockReq.params.envKey = 'staging';
      migrationService.deleteEnvironment.mockResolvedValue({ success: true });

      await controller.deleteEnvironment(mockReq, mockRes);

      expect(migrationService.deleteEnvironment).toHaveBeenCalledWith('staging');
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('Testing endpoints', () => {
    test('testConnection checks connectivity', async () => {
      mockReq.body = { envKey: 'prod' };
      migrationService.testConnection.mockResolvedValue({ ok: true });

      await controller.testConnection(mockReq, mockRes);

      expect(migrationService.testConnection).toHaveBeenCalledWith('prod');
      expect(mockRes.json).toHaveBeenCalledWith({ ok: true });
    });
  });
});
