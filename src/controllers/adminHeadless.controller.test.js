const mongoose = require('mongoose');

// Globally disable logging for this file to prevent Jest lifecycle issues
console.log = jest.fn();
console.error = jest.fn();

const controller = require('./adminHeadless.controller');
const headlessModelsService = require('../services/headlessModels.service');
const headlessExternalModelsService = require('../services/headlessExternalModels.service');
const llmService = require('../services/llm.service');
const llmDefaultsService = require('../services/llmDefaults.service');
const { getSettingValue } = require('../services/globalSettings.service');
const { createAuditEvent, getBasicAuthActor } = require('../services/audit.service');
const headlessApiTokensService = require('../services/headlessApiTokens.service');

jest.mock('../services/headlessModels.service');
jest.mock('../services/headlessExternalModels.service');
jest.mock('../services/llm.service');
jest.mock('../services/llmDefaults.service');
jest.mock('../services/globalSettings.service');
jest.mock('../services/headlessApiTokens.service', () => ({
  listApiTokens: jest.fn(),
  getApiTokenById: jest.fn(),
  createApiToken: jest.fn(),
  updateApiToken: jest.fn(),
  deleteApiToken: jest.fn(),
}));
jest.mock('../services/audit.service', () => ({
  createAuditEvent: jest.fn(),
  getBasicAuthActor: jest.fn(() => ({ actorType: 'admin', actorId: 'test' })),
}));

describe('adminHeadless.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      params: {},
      body: {},
      query: {},
      headers: {},
      get: jest.fn(),
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn(),
    };
  });

  describe('Model Definitions', () => {
    test('listModels returns all definitions', async () => {
      const mockItems = [{ codeIdentifier: 'test' }];
      headlessModelsService.listModelDefinitions.mockResolvedValue(mockItems);

      await controller.listModels(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ items: mockItems });
    });

    test('getModel returns single definition', async () => {
      mockReq.params.codeIdentifier = 'test';
      const mockItem = { codeIdentifier: 'test' };
      headlessModelsService.getModelDefinitionByCode.mockResolvedValue(mockItem);

      await controller.getModel(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ item: mockItem });
    });

    test('createModel creates new definition', async () => {
      mockReq.body = { codeIdentifier: 'test', displayName: 'Test' };
      const mockItem = { _id: '1', ...mockReq.body };
      headlessModelsService.createModelDefinition.mockResolvedValue(mockItem);

      await controller.createModel(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({ item: mockItem });
    });
  });

  describe('External Collections', () => {
    test('listExternalCollections returns collections', async () => {
      const mockItems = [{ name: 'coll1', type: 'collection' }];
      headlessExternalModelsService.listExternalCollections.mockResolvedValue(mockItems);

      await controller.listExternalCollections(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ items: mockItems });
    });

    test('inferExternalCollection returns inferred schema', async () => {
      mockReq.body = { collectionName: 'coll1' };
      const mockResult = { fields: [] };
      headlessExternalModelsService.inferExternalModelFromCollection.mockResolvedValue(mockResult);

      await controller.inferExternalCollection(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(mockResult);
    });
  });

  describe('Validation', () => {
    test('validateModelDefinition returns validation results', async () => {
      mockReq.body = { definition: { codeIdentifier: 'test' } };
      headlessModelsService.listModelDefinitions.mockResolvedValue([]);
      
      await controller.validateModelDefinition(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        valid: expect.any(Boolean)
      }));
    });
  });

  describe('Collection Items', () => {
    test('listCollectionItems returns items from dynamic model', async () => {
      mockReq.params.modelCode = 'test';
      const mockModel = {
        find: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ _id: '1' }]),
        countDocuments: jest.fn().mockResolvedValue(1),
      };
      headlessModelsService.getDynamicModel.mockResolvedValue(mockModel);

      await controller.listCollectionItems(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        items: expect.any(Array),
        total: 1
      }));
    });
  });

  describe('AI Model Builder', () => {
    test('aiModelBuilderChat returns proposal and validation', async () => {
      mockReq.body = { message: 'create a blog model' };
      
      headlessModelsService.listModelDefinitions.mockResolvedValue([]);
      llmDefaultsService.resolveLlmProviderModel.mockResolvedValue({ providerKey: 'openrouter', model: 'gpt-4' });
      getSettingValue.mockResolvedValue('some-value');
      
      const mockLlmResponse = { 
        content: JSON.stringify({
          assistantMessage: 'Sure',
          proposal: { creates: [{ codeIdentifier: 'blog', displayName: 'Blog' }], updates: [] }
        })
      };
      llmService.callAdhoc.mockResolvedValue(mockLlmResponse);

      await controller.aiModelBuilderChat(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        assistantMessage: 'Sure',
        proposal: expect.any(Object),
        validation: expect.objectContaining({ valid: true })
      }));
    }, 10000);

    test('applyModelProposal creates and updates models', async () => {
      mockReq.body = {
        creates: [{ codeIdentifier: 'post', displayName: 'Post', fields: [] }],
        updates: []
      };

      headlessModelsService.listModelDefinitions.mockResolvedValue([]);
      headlessModelsService.createModelDefinition.mockResolvedValue({ _id: 'p1', codeIdentifier: 'post' });

      await controller.applyModelProposal(mockReq, mockRes);

      expect(headlessModelsService.createModelDefinition).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        created: expect.any(Array)
      }));
    });
  });

  describe('API Token Management', () => {
    test('listTokens returns all API tokens', async () => {
      const mockTokens = [{ _id: 't1', name: 'Token 1' }];
      headlessApiTokensService.listApiTokens.mockResolvedValue(mockTokens);

      await controller.listTokens(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ items: mockTokens });
    });

    test('createToken creates and returns a new token', async () => {
      mockReq.body = { name: 'New Token' };
      headlessApiTokensService.createApiToken.mockResolvedValue({ token: 'plain', item: { _id: 't1', name: 'New Token' } });

      await controller.createToken(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ token: 'plain' }));
    });

    test('getToken returns a specific token', async () => {
      mockReq.params.id = 't1';
      headlessApiTokensService.getApiTokenById.mockResolvedValue({ _id: 't1', name: 'Token 1' });

      await controller.getToken(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ item: expect.objectContaining({ name: 'Token 1' }) });
    });

    test('updateToken updates token metadata', async () => {
      mockReq.params.id = 't1';
      mockReq.body = { name: 'Updated Name' };
      headlessApiTokensService.updateApiToken.mockResolvedValue({ _id: 't1', name: 'Updated Name' });

      await controller.updateToken(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ item: expect.objectContaining({ name: 'Updated Name' }) });
    });

    test('deleteToken removes a token', async () => {
      mockReq.params.id = 't1';
      headlessApiTokensService.deleteApiToken.mockResolvedValue({ success: true });

      await controller.deleteToken(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('External Model Management', () => {
    test('importExternalModel creates or updates definition from collection', async () => {
      mockReq.body = { 
        collectionName: 'users', 
        codeIdentifier: 'ext_users', 
        displayName: 'External Users' 
      };
      const mockResult = { created: true, item: { _id: 'e1' }, inference: {} };
      headlessExternalModelsService.createOrUpdateExternalModel.mockResolvedValue(mockResult);

      await controller.importExternalModel(mockReq, mockRes);

      expect(headlessExternalModelsService.createOrUpdateExternalModel).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    test('syncExternalModel refreshes definition from collection', async () => {
      mockReq.params.codeIdentifier = 'ext_users';
      const mockExisting = { codeIdentifier: 'ext_users', sourceCollectionName: 'users', isExternal: true };
      headlessModelsService.getModelDefinitionByCode.mockResolvedValue(mockExisting);
      
      const mockResult = { created: false, item: { _id: 'e1' }, inference: {} };
      headlessExternalModelsService.createOrUpdateExternalModel.mockResolvedValue(mockResult);

      await controller.syncExternalModel(mockReq, mockRes);

      expect(headlessExternalModelsService.createOrUpdateExternalModel).toHaveBeenCalledWith(expect.objectContaining({
        collectionName: 'users'
      }));
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ item: mockResult.item }));
    });
  });
});
