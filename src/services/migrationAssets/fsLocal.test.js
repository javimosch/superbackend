const fs = require('fs');
const path = require('path');
const { createFsLocalEndpoint } = require('./fsLocal');

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  readFileSync: jest.fn(),
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn()
  }
}));

describe('migrationAssets/fsLocal', () => {
  const mockBaseDir = '/tmp/migration-test';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.UPLOAD_DIR = 'uploads';
  });

  describe('createFsLocalEndpoint', () => {
    test('resolves relative baseDir to absolute path', () => {
      const endpoint = createFsLocalEndpoint({ baseDir: 'custom-uploads' });
      expect(endpoint.baseDir).toBe(path.join(process.cwd(), 'custom-uploads'));
    });

    test('testWritable creates and deletes a test file', async () => {
      const endpoint = createFsLocalEndpoint({ baseDir: mockBaseDir });
      fs.existsSync.mockReturnValue(true);
      
      const result = await endpoint.testWritable();
      
      expect(result.ok).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    test('getObject returns null if file missing', async () => {
      const endpoint = createFsLocalEndpoint({ baseDir: mockBaseDir });
      fs.existsSync.mockReturnValue(false);
      
      const result = await endpoint.getObject({ key: 'missing.txt' });
      expect(result).toBeNull();
    });

    test('putObject writes file content', async () => {
      const endpoint = createFsLocalEndpoint({ baseDir: mockBaseDir });
      const mockBuffer = Buffer.from('data');
      
      fs.promises.mkdir.mockResolvedValue();
      fs.promises.writeFile.mockResolvedValue();

      const result = await endpoint.putObject({ key: 'new.txt', body: mockBuffer });
      
      expect(result.ok).toBe(true);
      expect(fs.promises.writeFile).toHaveBeenCalled();
    });
  });
});
