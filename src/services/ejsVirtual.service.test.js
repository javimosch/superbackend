const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const VirtualEjsFile = require('../models/VirtualEjsFile');
const VirtualEjsGroupChange = require('../models/VirtualEjsGroupChange');
const VirtualEjsFileVersion = require('../models/VirtualEjsFileVersion');
const ejsVirtualService = require('./ejsVirtual.service');
const llmService = require('./llm.service');
const llmDefaults = require('./llmDefaults.service');

jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
    readFile: jest.fn()
  },
  existsSync: jest.fn(),
  statSync: jest.fn()
}));

jest.mock('../models/VirtualEjsFile', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  find: jest.fn()
}));

jest.mock('../models/VirtualEjsFileVersion', () => ({
  create: jest.fn()
}));

jest.mock('../models/VirtualEjsGroupChange', () => ({
  countDocuments: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  updateOne: jest.fn()
}));

jest.mock('./llm.service');
jest.mock('./llmDefaults.service');

jest.mock('ejs', () => ({
  render: jest.fn()
}));

describe('ejsVirtual.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ejsVirtualService.clearCache();
  });

  describe('normalizeRelPath', () => {
    test('normalizes paths correctly', () => {
      expect(ejsVirtualService.normalizeRelPath('test.ejs')).toBe('test.ejs');
      expect(ejsVirtualService.normalizeRelPath('/test.ejs')).toBe('test.ejs');
      expect(ejsVirtualService.normalizeRelPath('sub\\path.ejs')).toBe('sub/path.ejs');
    });

    test('throws on invalid paths', () => {
      expect(() => ejsVirtualService.normalizeRelPath('')).toThrow('path is required');
      expect(() => ejsVirtualService.normalizeRelPath('../outside.ejs')).toThrow('Invalid path');
      expect(() => ejsVirtualService.normalizeRelPath('test.txt')).toThrow('path must end with .ejs');
    });
  });

  describe('resolveTemplateSource', () => {
    test('resolves from DB if enabled and exists', async () => {
      const mockDoc = {
        path: 'test.ejs',
        enabled: true,
        content: 'db content',
        updatedAt: new Date()
      };
      VirtualEjsFile.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockDoc) });

      const result = await ejsVirtualService.resolveTemplateSource({ relPath: 'test.ejs' });

      expect(result.source).toBe('db');
      expect(result.content).toBe('db content');
    });

    test('falls back to FS if not in DB', async () => {
      VirtualEjsFile.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      fs.promises.stat.mockResolvedValue({ isFile: () => true, size: 100 });
      fs.promises.readFile.mockResolvedValue('fs content');

      const result = await ejsVirtualService.resolveTemplateSource({ relPath: 'test.ejs' });

      expect(result.source).toBe('fs');
      expect(result.content).toBe('fs content');
    });
  });

  describe('vibeEdit', () => {
    test('calls LLM and applies patches', async () => {
      const paths = ['test.ejs'];
      const prompt = 'Change text';
      
      llmDefaults.resolveLlmProviderModel.mockResolvedValue({ providerKey: 'p1', model: 'm1' });
      
      // Mock findOne to handle both .lean() and direct document access
      VirtualEjsFile.findOne.mockImplementation((query) => {
        const mockDoc = { 
          path: query.path, 
          toObject: jest.fn().mockReturnValue({ path: query.path }) 
        };
        return {
          ...mockDoc,
          lean: jest.fn().mockResolvedValue(null)
        };
      });

      VirtualEjsFile.findOneAndUpdate.mockResolvedValue({ 
        _id: 'file1', 
        path: 'test.ejs',
        toObject: () => ({ path: 'test.ejs' }) 
      });
      VirtualEjsGroupChange.countDocuments.mockResolvedValue(0);
      VirtualEjsGroupChange.create.mockResolvedValue({ _id: 'group1' });
      VirtualEjsGroupChange.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: 'group1' }) });
      VirtualEjsFileVersion.create.mockResolvedValue({ _id: 'v1' });

      fs.promises.stat.mockResolvedValue({ isFile: () => true, size: 100 });
      fs.promises.readFile.mockResolvedValue('original content');

      llmService.callAdhoc.mockResolvedValue({
        content: 'FILE: test.ejs\n<<<<<<< SEARCH\noriginal content\n=======\nnew content\n>>>>>>> REPLACE'
      });

      const result = await ejsVirtualService.vibeEdit({ prompt, paths });

      expect(result.updates[0].path).toBe('test.ejs');
      expect(VirtualEjsFile.findOneAndUpdate).toHaveBeenCalledWith(
        { path: 'test.ejs' },
        expect.objectContaining({ '$set': expect.objectContaining({ content: 'new content' }) }),
        expect.any(Object)
      );
    });
  });

  describe('recordIntegratedUsage', () => {
    test('updates usage stats in DB', async () => {
      await ejsVirtualService.recordIntegratedUsage('test.ejs');
      expect(VirtualEjsFile.updateOne).toHaveBeenCalledWith(
        { path: 'test.ejs' },
        expect.any(Object),
        { upsert: true }
      );
    });
  });

  describe('renderToString', () => {
    test('renders simple template', async () => {
      VirtualEjsFile.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
      VirtualEjsFile.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      VirtualEjsFile.updateOne.mockResolvedValue({});
      fs.promises.stat.mockResolvedValue({ isFile: () => true, size: 100 });
      fs.promises.readFile.mockResolvedValue('Hello <%= name %>');
      ejs.render.mockReturnValue('Hello World');

      const result = await ejsVirtualService.renderToString({}, 'test.ejs', { name: 'World' });

      expect(result).toBe('Hello World');
      expect(ejs.render).toHaveBeenCalledWith(
        'Hello <%= name %>',
        expect.objectContaining({ name: 'World' }),
        expect.anything()
      );
    });

    test('throws error if template not found', async () => {
      VirtualEjsFile.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
      VirtualEjsFile.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      fs.promises.stat.mockRejectedValue(new Error('ENOENT'));

      await expect(ejsVirtualService.renderToString({}, 'missing.ejs')).rejects.toThrow();
    });
  });
});
