const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  ensureUploadDir,
  generateFilename,
  validateFileType,
  validateFileSize,
  saveBase64File,
  saveMultipartFile,
  deleteFile
} = require('./storage');

// Mock dependencies
jest.mock('fs');
jest.mock('crypto');

describe('Storage Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment variables
    delete process.env.UPLOAD_DIR;
    delete process.env.MAX_FILE_SIZE;
  });

  describe('ensureUploadDir', () => {
    test('should create upload directory if it does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation();

      const result = ensureUploadDir('images');

      expect(fs.existsSync).toHaveBeenCalledWith(path.join(process.cwd(), 'uploads', 'images'));
      expect(fs.mkdirSync).toHaveBeenCalledWith(path.join(process.cwd(), 'uploads', 'images'), { recursive: true });
      expect(result).toBe(path.join(process.cwd(), 'uploads', 'images'));
    });

    test('should not create directory if it already exists', () => {
      fs.existsSync.mockReturnValue(true);

      const result = ensureUploadDir('documents');

      expect(fs.existsSync).toHaveBeenCalled();
      expect(fs.mkdirSync).not.toHaveBeenCalled();
      expect(result).toBe(path.join(process.cwd(), 'uploads', 'documents'));
    });

    test('should use custom upload directory from environment', () => {
      process.env.UPLOAD_DIR = 'custom-uploads';
      fs.existsSync.mockReturnValue(true);

      const result = ensureUploadDir();

      expect(result).toBe(path.join(process.cwd(), 'custom-uploads'));
    });

    test('should handle empty subdir parameter', () => {
      fs.existsSync.mockReturnValue(true);

      const result = ensureUploadDir();

      expect(result).toBe(path.join(process.cwd(), 'uploads'));
    });
  });

  describe('generateFilename', () => {
    test('should generate filename with timestamp and hash', () => {
      const mockDate = 1640995200000; // Fixed timestamp
      const mockHash = 'abcd1234';
      
      jest.spyOn(Date, 'now').mockReturnValue(mockDate);
      crypto.randomBytes.mockReturnValue(Buffer.from(mockHash, 'hex'));

      const result = generateFilename('test.jpg');

      expect(result).toBe(`${mockDate}-${mockHash}.jpg`);
      expect(crypto.randomBytes).toHaveBeenCalledWith(8);
    });

    test('should include prefix in filename', () => {
      const mockDate = 1640995200000;
      const mockHash = 'abcd1234';
      
      jest.spyOn(Date, 'now').mockReturnValue(mockDate);
      crypto.randomBytes.mockReturnValue(Buffer.from(mockHash, 'hex'));

      const result = generateFilename('avatar.png', 'user_');

      expect(result).toBe(`user_${mockDate}-${mockHash}.png`);
    });

    test('should handle files without extension', () => {
      const mockDate = 1640995200000;
      const mockHash = 'abcd1234';
      
      jest.spyOn(Date, 'now').mockReturnValue(mockDate);
      crypto.randomBytes.mockReturnValue(Buffer.from(mockHash, 'hex'));

      const result = generateFilename('filename');

      expect(result).toBe(`${mockDate}-${mockHash}`);
    });

    test('should convert extension to lowercase', () => {
      const mockDate = 1640995200000;
      const mockHash = 'abcd1234';
      
      jest.spyOn(Date, 'now').mockReturnValue(mockDate);
      crypto.randomBytes.mockReturnValue(Buffer.from(mockHash, 'hex'));

      const result = generateFilename('IMAGE.JPEG');

      expect(result).toBe(`${mockDate}-${mockHash}.jpeg`);
    });
  });

  describe('validateFileType', () => {
    test('should validate image file types', () => {
      expect(validateFileType('image/jpeg')).toBe(true);
      expect(validateFileType('image/png')).toBe(true);
      expect(validateFileType('image/gif')).toBe(true);
      expect(validateFileType('image/webp')).toBe(true);
    });

    test('should validate video file types', () => {
      expect(validateFileType('video/mp4', 'video')).toBe(true);
      expect(validateFileType('video/webm', 'video')).toBe(true);
      expect(validateFileType('video/quicktime', 'video')).toBe(true);
    });

    test('should reject invalid file types', () => {
      expect(validateFileType('application/pdf')).toBe(false);
      expect(validateFileType('text/plain')).toBe(false);
      expect(validateFileType('image/svg+xml')).toBe(false);
    });

    test('should default to image category when invalid category provided', () => {
      expect(validateFileType('image/jpeg', 'unknown')).toBe(true);
      expect(validateFileType('video/mp4', 'unknown')).toBe(false);
    });

    test('should reject video types when checking against image category', () => {
      expect(validateFileType('video/mp4', 'image')).toBe(false);
    });
  });

  describe('validateFileSize', () => {
    test('should validate file size within default limit', () => {
      expect(validateFileSize(1024)).toBe(true); // 1KB
      expect(validateFileSize(10485760)).toBe(true); // 10MB (default limit)
    });

    test('should reject file size above default limit', () => {
      expect(validateFileSize(10485761)).toBe(false); // 10MB + 1 byte
      expect(validateFileSize(20971520)).toBe(false); // 20MB
    });

    test('should use custom file size limit from environment', () => {
      process.env.MAX_FILE_SIZE = '5242880'; // 5MB

      expect(validateFileSize(5242880)).toBe(true); // 5MB
      expect(validateFileSize(5242881)).toBe(false); // 5MB + 1 byte
    });

    test('should handle zero file size', () => {
      expect(validateFileSize(0)).toBe(true);
    });
  });

  describe('saveBase64File', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockImplementation();
      crypto.randomBytes.mockReturnValue(Buffer.from('abcd1234', 'hex'));
      jest.spyOn(Date, 'now').mockReturnValue(1640995200000);
    });

    test('should save valid base64 image file', async () => {
      const base64Data = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/';
      
      const result = await saveBase64File(base64Data);

      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(result).toBe('/uploads/images/1640995200000-abcd1234.jpg');
    });

    test('should handle custom options', async () => {
      const base64Data = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      
      const result = await saveBase64File(base64Data, {
        subdir: 'avatars',
        prefix: 'user_',
        allowedCategory: 'image'
      });

      expect(result).toBe('/uploads/avatars/user_1640995200000-abcd1234.png');
    });

    test('should throw error for invalid base64 format', async () => {
      const invalidBase64 = 'invalid-base64-data';

      await expect(saveBase64File(invalidBase64)).rejects.toThrow('Invalid base64 data');
    });

    test('should throw error for invalid file type', async () => {
      const base64Data = 'data:application/pdf;base64,JVBERi0xLjQK';

      await expect(saveBase64File(base64Data)).rejects.toThrow('Invalid file type');
    });

    test('should throw error for file too large', async () => {
      process.env.MAX_FILE_SIZE = '100'; // 100 bytes
      const largeBase64Data = 'data:image/jpeg;base64,' + 'A'.repeat(1000);

      await expect(saveBase64File(largeBase64Data)).rejects.toThrow('File too large');
    });

    test('should handle jpeg to jpg extension conversion', async () => {
      const base64Data = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/';
      
      const result = await saveBase64File(base64Data);

      expect(result).toBe('/uploads/images/1640995200000-abcd1234.jpg');
    });
  });

  describe('saveMultipartFile', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockImplementation();
      fs.copyFileSync.mockImplementation();
      fs.unlinkSync.mockImplementation();
      crypto.randomBytes.mockReturnValue(Buffer.from('abcd1234', 'hex'));
      jest.spyOn(Date, 'now').mockReturnValue(1640995200000);
    });

    test('should save multipart file using mv method', async () => {
      const mockFile = {
        mimetype: 'image/jpeg',
        size: 1024,
        originalname: 'test.jpg',
        mv: jest.fn().mockResolvedValue()
      };

      const result = await saveMultipartFile(mockFile);

      expect(mockFile.mv).toHaveBeenCalled();
      expect(result).toBe('/uploads/images/1640995200000-abcd1234.jpg');
    });

    test('should save multipart file using path method', async () => {
      const mockFile = {
        mimetype: 'image/png',
        size: 2048,
        name: 'test.png',
        path: '/tmp/upload_123'
      };

      const result = await saveMultipartFile(mockFile);

      expect(fs.copyFileSync).toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/upload_123');
      expect(result).toBe('/uploads/images/1640995200000-abcd1234.png');
    });

    test('should save multipart file using buffer method', async () => {
      const mockFile = {
        mimetype: 'image/gif',
        size: 512,
        originalname: 'test.gif',
        buffer: Buffer.from('test-buffer')
      };

      const result = await saveMultipartFile(mockFile);

      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(result).toBe('/uploads/images/1640995200000-abcd1234.gif');
    });

    test('should throw error for invalid file type', async () => {
      const mockFile = {
        mimetype: 'application/pdf',
        size: 1024,
        originalname: 'test.pdf'
      };

      await expect(saveMultipartFile(mockFile)).rejects.toThrow('Invalid file type');
    });

    test('should throw error for file too large', async () => {
      const mockFile = {
        mimetype: 'image/jpeg',
        size: 20971520, // 20MB
        originalname: 'large.jpg'
      };

      await expect(saveMultipartFile(mockFile)).rejects.toThrow('File too large');
    });

    test('should throw error when unable to save file', async () => {
      const mockFile = {
        mimetype: 'image/jpeg',
        size: 1024,
        originalname: 'test.jpg'
        // No mv, path, or buffer property
      };

      await expect(saveMultipartFile(mockFile)).rejects.toThrow('Unable to save file');
    });

    test('should handle custom options', async () => {
      const mockFile = {
        mimetype: 'video/mp4',
        size: 1024,
        originalname: 'test.mp4',
        buffer: Buffer.from('test-video')
      };

      const result = await saveMultipartFile(mockFile, {
        subdir: 'videos',
        prefix: 'vid_',
        allowedCategory: 'video'
      });

      expect(result).toBe('/uploads/videos/vid_1640995200000-abcd1234.mp4');
    });
  });

  describe('deleteFile', () => {
    test('should delete existing file', () => {
      fs.existsSync.mockReturnValue(true);
      fs.unlinkSync.mockImplementation();

      deleteFile('/uploads/images/test.jpg');

      expect(fs.existsSync).toHaveBeenCalledWith(path.join(process.cwd(), '/uploads/images/test.jpg'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(process.cwd(), '/uploads/images/test.jpg'));
    });

    test('should not throw error for non-existent file', () => {
      fs.existsSync.mockReturnValue(false);

      expect(() => deleteFile('/uploads/images/nonexistent.jpg')).not.toThrow();
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    test('should handle null or undefined file URL', () => {
      expect(() => deleteFile(null)).not.toThrow();
      expect(() => deleteFile(undefined)).not.toThrow();
      expect(() => deleteFile('')).not.toThrow();
      
      expect(fs.existsSync).not.toHaveBeenCalled();
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    test('should convert relative URL to absolute filepath', () => {
      fs.existsSync.mockReturnValue(true);
      fs.unlinkSync.mockImplementation();

      deleteFile('uploads/test.jpg');

      expect(fs.existsSync).toHaveBeenCalledWith(path.join(process.cwd(), 'uploads/test.jpg'));
    });
  });
});