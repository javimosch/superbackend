const mongoose = require('mongoose');
const HeadlessModelDefinition = require('../models/HeadlessModelDefinition');
const headlessModelsService = require('./headlessModels.service');

jest.mock('../models/HeadlessModelDefinition');

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
});
