const mongoose = require('mongoose');
const HeadlessModelDefinition = require('../models/HeadlessModelDefinition');
const headlessModelsService = require('./headlessModels.service');

jest.mock('../models/HeadlessModelDefinition');

// Mock mongoose connection for auto-migration
mongoose.connection.collection = jest.fn().mockReturnValue({
  updateMany: jest.fn().mockResolvedValue({ acknowledged: true })
});

describe('headlessModels.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('normalizeCodeIdentifier', () => {
    test('normalizes valid identifiers', () => {
      expect(headlessModelsService.normalizeCodeIdentifier(' mymodel ')).toBe('mymodel');
      expect(headlessModelsService.normalizeCodeIdentifier('test_123')).toBe('test_123');
    });

    test('throws on invalid identifiers', () => {
      expect(() => headlessModelsService.normalizeCodeIdentifier('')).toThrow('codeIdentifier is required');
      expect(() => headlessModelsService.normalizeCodeIdentifier('123test')).toThrow('codeIdentifier must match');
      expect(() => headlessModelsService.normalizeCodeIdentifier('test-hyphen')).toThrow('codeIdentifier must match');
    });
  });

  describe('getMongooseModelName', () => {
    test('returns prefixed model name', () => {
      expect(headlessModelsService.getMongooseModelName('post')).toBe('Headless_post');
    });
  });

  describe('getMongoCollectionName', () => {
    test('returns prefixed collection name', () => {
      expect(headlessModelsService.getMongoCollectionName('post')).toBe('headless_post');
    });
  });

  describe('listModelDefinitions', () => {
    test('returns active model definitions', async () => {
      const mockDefs = [{ codeIdentifier: 'test', isActive: true }];
      HeadlessModelDefinition.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockDefs)
      });

      const result = await headlessModelsService.listModelDefinitions();
      expect(result).toEqual(mockDefs);
      expect(HeadlessModelDefinition.find).toHaveBeenCalledWith({ isActive: true });
    });
  });

  describe('getModelDefinitionByCode', () => {
    test('returns definition by code identifier', async () => {
      const mockDef = { codeIdentifier: 'test', isActive: true };
      HeadlessModelDefinition.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockDef)
      });

      const result = await headlessModelsService.getModelDefinitionByCode('test');
      expect(result).toEqual(mockDef);
      expect(HeadlessModelDefinition.findOne).toHaveBeenCalledWith({ codeIdentifier: 'test', isActive: true });
    });
  });

  describe('createModelDefinition', () => {
    test('creates a new model definition', async () => {
      const payload = {
        codeIdentifier: 'product',
        displayName: 'Product',
        fields: [{ name: 'name', type: 'string', required: true }]
      };

      HeadlessModelDefinition.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null)
      });
      HeadlessModelDefinition.create.mockResolvedValue({
        ...payload,
        toObject: jest.fn().mockReturnValue({ ...payload, version: 1 })
      });

      const result = await headlessModelsService.createModelDefinition(payload);
      expect(result.codeIdentifier).toBe('product');
      expect(result.version).toBe(1);
      expect(HeadlessModelDefinition.create).toHaveBeenCalled();
    });

    test('throws error if model already exists', async () => {
      HeadlessModelDefinition.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ codeIdentifier: 'exists' })
      });

      await expect(headlessModelsService.createModelDefinition({ codeIdentifier: 'exists' }))
        .rejects.toThrow('Model already exists');
    });
  });

  describe('getDynamicModel', () => {
    test('creates and returns a Mongoose model from definition', async () => {
      const mockDef = {
        codeIdentifier: 'dynamic',
        version: 1,
        fieldsHash: 'h1',
        fields: [
          { name: 'title', type: 'string', required: true },
          { name: 'count', type: 'number' }
        ],
        indexes: []
      };

      HeadlessModelDefinition.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockDef)
      });

      const Model = await headlessModelsService.getDynamicModel('dynamic');

      expect(Model.modelName).toBe('Headless_dynamic');
      expect(Model.schema).toBeDefined();
      expect(Model.schema.path('title').instance).toBe('String');
      expect(Model.schema.path('count').instance).toBe('Number');
    });

    test('handles reference fields in schema', async () => {
      const mockDef = {
        codeIdentifier: 'ref_test',
        version: 1,
        fieldsHash: 'h2',
        fields: [
          { name: 'owner', type: 'ref', refModelCode: 'user' }
        ]
      };

      HeadlessModelDefinition.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockDef)
      });

      const Model = await headlessModelsService.getDynamicModel('ref_test');
      expect(Model.schema.path('owner').instance).toBe('ObjectId');
      expect(Model.schema.path('owner').options.ref).toBe('Headless_user');
    });

    test('throws error if definition missing', async () => {
      HeadlessModelDefinition.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null)
      });

      await expect(headlessModelsService.getDynamicModel('missing'))
        .rejects.toThrow('Model not found');
    });
  });

  describe('updateModelDefinition', () => {
    test('updates definition and increments version on field changes', async () => {
      const mockDoc = {
        codeIdentifier: 'updatable',
        displayName: 'Old Name',
        fields: [{ name: 'f1', type: 'string' }],
        fieldsHash: 'old-hash',
        version: 1,
        save: jest.fn().mockResolvedValue(true),
        toObject: function() { return this; }
      };

      HeadlessModelDefinition.findOne.mockResolvedValue(mockDoc);

      const updates = {
        displayName: 'New Name',
        fields: [{ name: 'f1', type: 'string' }, { name: 'f2', type: 'number' }]
      };

      const result = await headlessModelsService.updateModelDefinition('updatable', updates);

      expect(result.displayName).toBe('New Name');
      expect(result.version).toBe(2);
      expect(mockDoc.save).toHaveBeenCalled();
    });
  });
});
