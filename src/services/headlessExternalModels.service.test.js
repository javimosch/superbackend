const mongoose = require('mongoose');
const HeadlessModelDefinition = require('../models/HeadlessModelDefinition');
const headlessExternalModels = require('./headlessExternalModels.service');

jest.mock('../models/HeadlessModelDefinition');

describe('headlessExternalModels.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('detectFieldType', () => {
    test('detects basic types correctly', () => {
      const { detectFieldType } = require('./headlessExternalModels.service');
      // Use internal function if possible or test via public API
    });
  });

  describe('listExternalCollections', () => {
    test('returns list of collections from mongo', async () => {
      const mockCollections = [{ name: 'users' }, { name: 'posts' }];
      const mockCursor = {
        toArray: jest.fn().mockResolvedValue(mockCollections)
      };
      
      const originalDb = mongoose.connection.db;
      mongoose.connection.db = {
        listCollections: jest.fn().mockReturnValue(mockCursor)
      };

      const result = await headlessExternalModels.listExternalCollections();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('posts'); // sorted alphabetically
      expect(result[1].name).toBe('users');
      
      mongoose.connection.db = originalDb;
    });

    test('throws error if mongo connection not ready', async () => {
      const originalDb = mongoose.connection.db;
      mongoose.connection.db = null;

      await expect(headlessExternalModels.listExternalCollections())
        .rejects.toThrow('Mongo connection not ready');

      mongoose.connection.db = originalDb;
    });
  });

  describe('inferExternalModelFromCollection', () => {
    test('infers fields and indexes from sample documents', async () => {
      const mockDocs = [
        { name: 'test', age: 25, isActive: true, createdAt: new Date() }
      ];
      const mockCollection = {
        aggregate: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue(mockDocs) }),
        indexes: jest.fn().mockResolvedValue([])
      };
      
      const originalDb = mongoose.connection.db;
      mongoose.connection.db = {
        collection: jest.fn().mockReturnValue(mockCollection)
      };

      HeadlessModelDefinition.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      });

      const result = await headlessExternalModels.inferExternalModelFromCollection({ 
        collectionName: 'test_coll' 
      });

      expect(result.collectionName).toBe('test_coll');
      expect(result.fields).toHaveLength(4);
      expect(result.fields.find(f => f.name === 'name').type).toBe('string');
      expect(result.fields.find(f => f.name === 'age').type).toBe('number');
      
      mongoose.connection.db = originalDb;
    });
  });

  describe('createOrUpdateExternalModel', () => {
    let originalDb;

    beforeEach(() => {
      originalDb = mongoose.connection.db;
      mongoose.connection.db = {
        collection: jest.fn().mockReturnValue({
          aggregate: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
          indexes: jest.fn().mockResolvedValue([])
        })
      };
    });

    afterEach(() => {
      mongoose.connection.db = originalDb;
    });

    test('creates a new external model definition', async () => {
      const mockInferred = {
        fields: [{ name: 'f1', type: 'string' }],
        indexes: [],
        fieldsHash: 'h1'
      };

      // Mock internal inference call
      jest.spyOn(headlessExternalModels, 'inferExternalModelFromCollection').mockResolvedValue(mockInferred);
      HeadlessModelDefinition.findOne.mockResolvedValue(null);
      HeadlessModelDefinition.create.mockResolvedValue({ toObject: () => ({ codeIdentifier: 'ext_test' }) });

      const result = await headlessExternalModels.createOrUpdateExternalModel({
        collectionName: 'coll1',
        codeIdentifier: 'ext_test',
        displayName: 'Test Ext'
      });

      expect(result.created).toBe(true);
      expect(HeadlessModelDefinition.create).toHaveBeenCalled();
    });

    test('updates existing external model definition', async () => {
      const mockExisting = {
        codeIdentifier: 'ext_test',
        fieldsHash: 'old-hash',
        save: jest.fn().mockResolvedValue(true),
        toObject: function() { return this; }
      };

      jest.spyOn(headlessExternalModels, 'inferExternalModelFromCollection').mockResolvedValue({
        fields: [{ name: 'f1', type: 'number' }],
        indexes: [],
        fieldsHash: 'new-hash'
      });
      HeadlessModelDefinition.findOne.mockResolvedValue(mockExisting);

      const result = await headlessExternalModels.createOrUpdateExternalModel({
        collectionName: 'coll1',
        codeIdentifier: 'ext_test'
      });

      expect(result.created).toBe(false);
      expect(mockExisting.version).toBeDefined();
      expect(mockExisting.save).toHaveBeenCalled();
    });

    test('throws error if codeIdentifier does not start with ext_', async () => {
      await expect(headlessExternalModels.createOrUpdateExternalModel({
        collectionName: 'coll1',
        codeIdentifier: 'bad_name'
      })).rejects.toThrow('External model codeIdentifier must start with ext_');
    });
  });
});
