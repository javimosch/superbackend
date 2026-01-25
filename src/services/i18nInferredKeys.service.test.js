const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const i18nInferredKeysService = require('./i18nInferredKeys.service');

jest.mock('fs');
jest.mock('ejs');

describe('i18nInferredKeys.service', () => {
  const mockDir = path.resolve(process.cwd(), 'mock-views');
  const mockFile = path.join(mockDir, 'index.ejs');

  beforeEach(() => {
    jest.clearAllMocks();
    i18nInferredKeysService.clearInferredI18nKeysCache();

    fs.existsSync.mockImplementation((p) => {
      const resolved = path.resolve(p);
      return resolved === mockDir || resolved === mockFile || resolved.endsWith('.gitignore');
    });
    
    fs.statSync.mockImplementation((p) => {
      const resolved = path.resolve(p);
      return {
        isDirectory: () => resolved === mockDir,
        isFile: () => resolved === mockFile,
        mtimeMs: 123,
        size: 456
      };
    });
    
    fs.readdirSync.mockImplementation((p) => {
      const resolved = path.resolve(p);
      if (resolved === mockDir) {
        return [{ name: 'index.ejs', isFile: () => true, isDirectory: () => false }];
      }
      return [];
    });
    
    fs.readFileSync.mockImplementation((p) => {
      const resolved = path.resolve(p);
      if (resolved === mockFile) return '<div data-i18n-key="hello.world">Hello</div>';
      return '';
    });
    
    ejs.render.mockReturnValue('<div data-i18n-key="hello.world">Hello</div>');
  });

  describe('getInferredI18nKeys', () => {
    test('scans directories and extracts keys', () => {
      const keys = i18nInferredKeysService.getInferredI18nKeys({ viewDirs: [mockDir] });

      expect(keys).toContain('hello.world');
      expect(fs.readFileSync).toHaveBeenCalled();
    });
  });

  describe('getInferredI18nEntries', () => {
    test('extracts entries with inferred values', () => {
      const entries = i18nInferredKeysService.getInferredI18nEntries({ viewDirs: [mockDir] });

      expect(entries['hello.world']).toEqual({ value: 'Hello', valueFormat: 'text' });
    });
  });
});
