const controller = require('./adminPages.controller');
const Page = require('../models/Page');
const PageCollection = require('../models/PageCollection');
const pagesService = require('../services/pages.service');
const { createAuditEvent, getBasicAuthActor } = require('../services/audit.service');

jest.mock('../models/Page');
jest.mock('../models/PageCollection');
jest.mock('../models/VirtualEjsFile');
jest.mock('../services/pages.service');
jest.mock('../services/audit.service', () => ({
  createAuditEvent: jest.fn(),
  getBasicAuthActor: jest.fn(() => ({ actorType: 'admin', actorId: 'test' })),
}));

describe('adminPages.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      params: {},
      body: {},
      query: {},
      app: { get: jest.fn() }
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  describe('listCollections', () => {
    test('returns collections from pagesService', async () => {
      const mockResult = { collections: [], total: 0 };
      pagesService.listCollections.mockResolvedValue(mockResult);

      await controller.listCollections(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(mockResult);
    });
  });

  describe('createCollection', () => {
    test('creates new collection with validated slug', async () => {
      mockReq.body = { slug: 'new-coll', name: 'New Coll' };
      pagesService.validateCollectionSlug.mockReturnValue('new-coll');
      PageCollection.findOne.mockResolvedValue(null);
      const mockDoc = { 
        _id: 'c1', 
        ...mockReq.body, 
        toObject: () => ({ _id: 'c1', ...mockReq.body }) 
      };
      PageCollection.create.mockResolvedValue(mockDoc);

      await controller.createCollection(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({ collection: expect.objectContaining({ slug: 'new-coll' }) });
    });

    test('returns 409 if slug already exists', async () => {
      mockReq.body = { slug: 'existing' };
      pagesService.validateCollectionSlug.mockReturnValue('existing');
      PageCollection.findOne.mockResolvedValue({ _id: 'c1' });

      await controller.createCollection(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(409);
    });
  });

  describe('createPage', () => {
    test('creates new page with block validation', async () => {
      mockReq.body = { slug: 'new-page', title: 'New Page', blocks: [] };
      pagesService.validatePageSlug.mockReturnValue('new-page');
      pagesService.getBlocksSchema.mockResolvedValue({});
      Page.findOne.mockResolvedValue(null);
      const mockDoc = { 
        _id: 'p1', 
        ...mockReq.body, 
        toObject: () => ({ _id: 'p1', ...mockReq.body }) 
      };
      Page.create.mockResolvedValue(mockDoc);

      await controller.createPage(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(pagesService.validateBlocks).toHaveBeenCalled();
    });
  });

  describe('deleteCollection', () => {
    test('rejects deletion if collection has pages', async () => {
      mockReq.params.id = 'c1';
      PageCollection.findById.mockResolvedValue({ _id: 'c1', toObject: () => ({}) });
      Page.countDocuments.mockResolvedValue(5);

      await controller.deleteCollection(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ 
        error: expect.stringContaining('5 page(s)') 
      }));
    });
  });

  describe('updateCollection', () => {
    test('updates collection successfully', async () => {
      mockReq.params.id = 'c1';
      mockReq.body = { name: 'Updated Name' };
      
      const mockDoc = { 
        _id: 'c1', 
        name: 'Old', 
        save: jest.fn().mockResolvedValue(true),
        toObject: function() { return this; } 
      };
      PageCollection.findById.mockResolvedValue(mockDoc);

      await controller.updateCollection(mockReq, mockRes);

      expect(mockDoc.name).toBe('Updated Name');
      expect(mockDoc.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ collection: expect.any(Object) }));
    });
  });

  describe('updatePage', () => {
    test('updates page successfully', async () => {
      mockReq.params.id = 'p1';
      mockReq.body = { title: 'New Title' };
      
      const mockDoc = { 
        _id: 'p1', 
        title: 'Old', 
        save: jest.fn().mockResolvedValue(true),
        toObject: function() { return this; } 
      };
      Page.findById.mockResolvedValue(mockDoc);

      await controller.updatePage(mockReq, mockRes);

      expect(mockDoc.title).toBe('New Title');
      expect(mockDoc.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalled();
    });
  });

  describe('Metadata discovery', () => {
    test('getAvailableTemplates returns core and virtual templates', async () => {
      const mockVirtual = [{ path: 'pages/templates/custom.ejs' }];
      const VirtualEjsFile = require('../models/VirtualEjsFile');
      VirtualEjsFile.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockVirtual)
      });

      await controller.getAvailableTemplates(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        templates: expect.arrayContaining([
          expect.objectContaining({ key: 'custom' }),
          expect.objectContaining({ key: 'default' })
        ])
      }));
    });
  });
});
