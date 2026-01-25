const controller = require('./adminEjsVirtual.controller');
const VirtualEjsFile = require('../models/VirtualEjsFile');
const VirtualEjsFileVersion = require('../models/VirtualEjsFileVersion');
const VirtualEjsGroupChange = require('../models/VirtualEjsGroupChange');
const ejsVirtualService = require('../services/ejsVirtual.service');
const { createAuditEvent, getBasicAuthActor } = require('../services/audit.service');
const fs = require('fs');
const path = require('path');

jest.mock('../models/VirtualEjsFile');
jest.mock('../models/VirtualEjsFileVersion');
jest.mock('../models/VirtualEjsGroupChange');
jest.mock('../services/ejsVirtual.service');
jest.mock('../services/audit.service', () => ({
  createAuditEvent: jest.fn(),
  getBasicAuthActor: jest.fn(() => ({ actorType: 'admin', actorId: 'test' })),
}));
jest.mock('fs', () => ({
  promises: {
    readdir: jest.fn(),
  },
}));

describe('adminEjsVirtual.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      app: { get: jest.fn() },
      query: {},
      params: {},
      body: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('list', () => {
    test('returns combined list of DB and FS files', async () => {
      mockReq.app.get.mockReturnValue('/views');
      VirtualEjsFile.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ path: 'db.ejs', enabled: true }])
      });
      fs.promises.readdir.mockResolvedValue([{ name: 'fs.ejs', isDirectory: () => false, isFile: () => true }]);

      await controller.list(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ path: 'db.ejs' }),
          expect.objectContaining({ path: 'fs.ejs' })
        ])
      }));
    });
  });

  describe('getFile', () => {
    test('returns file details from both sources', async () => {
      mockReq.query.path = 'test.ejs';
      ejsVirtualService.normalizeRelPath.mockReturnValue('test.ejs');
      ejsVirtualService.readFsView.mockResolvedValue('fs content');
      VirtualEjsFile.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ content: 'db content', enabled: true }) });
      ejsVirtualService.resolveTemplateSource.mockResolvedValue({ source: 'db', content: 'db content' });

      await controller.getFile(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        path: 'test.ejs',
        fs: { content: 'fs content' },
        db: expect.objectContaining({ content: 'db content' })
      }));
    });
  });

  describe('saveFile', () => {
    test('saves file override and creates version/group', async () => {
      mockReq.query.path = 'test.ejs';
      mockReq.body = { content: 'new content', enabled: true };
      ejsVirtualService.normalizeRelPath.mockReturnValue('test.ejs');
      
      const mockDoc = { _id: 'f1', toObject: function() { return this; } };
      VirtualEjsFile.findOne.mockResolvedValue(null);
      VirtualEjsFile.findOneAndUpdate.mockResolvedValue(mockDoc);
      VirtualEjsGroupChange.countDocuments.mockResolvedValue(0);
      VirtualEjsGroupChange.create.mockResolvedValue({ _id: 'g1', toObject: () => ({}) });
      VirtualEjsFileVersion.create.mockResolvedValue({ _id: 'v1', toObject: () => ({}) });

      await controller.saveFile(mockReq, mockRes);

      expect(VirtualEjsFile.findOneAndUpdate).toHaveBeenCalled();
      expect(VirtualEjsFileVersion.create).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalled();
    });
  });

  describe('clearCache', () => {
    test('clears service cache and logs audit', async () => {
      await controller.clearCache(mockReq, mockRes);
      expect(ejsVirtualService.clearCache).toHaveBeenCalled();
      expect(createAuditEvent).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });
  });
});
