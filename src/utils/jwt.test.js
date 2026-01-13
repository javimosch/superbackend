const jwt = require('jsonwebtoken');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
} = require('./jwt');

// Mock jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  verify: jest.fn()
}));

describe('JWT Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set up environment variables
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  });

  afterEach(() => {
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
  });

  describe('generateAccessToken', () => {
    test('should generate access token with user role', () => {
      const mockToken = 'mock-access-token';
      jwt.sign.mockReturnValue(mockToken);

      const result = generateAccessToken('user123');

      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: 'user123', role: 'user' },
        'test-access-secret',
        { expiresIn: '30d' }
      );
      expect(result).toBe(mockToken);
    });

    test('should generate access token with custom role', () => {
      const mockToken = 'mock-access-token-admin';
      jwt.sign.mockReturnValue(mockToken);

      const result = generateAccessToken('admin123', 'admin');

      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: 'admin123', role: 'admin' },
        'test-access-secret',
        { expiresIn: '30d' }
      );
      expect(result).toBe(mockToken);
    });

    test('should use default secret when env var not set', () => {
      delete process.env.JWT_ACCESS_SECRET;
      jwt.sign.mockReturnValue('token');

      generateAccessToken('user123');

      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: 'user123', role: 'user' },
        'access-secret-change-me',
        { expiresIn: '30d' }
      );
    });
  });

  describe('generateRefreshToken', () => {
    test('should generate refresh token', () => {
      const mockToken = 'mock-refresh-token';
      jwt.sign.mockReturnValue(mockToken);

      const result = generateRefreshToken('user123');

      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: 'user123' },
        'test-refresh-secret',
        { expiresIn: '30d' }
      );
      expect(result).toBe(mockToken);
    });

    test('should use default secret when env var not set', () => {
      delete process.env.JWT_REFRESH_SECRET;
      jwt.sign.mockReturnValue('token');

      generateRefreshToken('user123');

      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: 'user123' },
        'refresh-secret-change-me',
        { expiresIn: '30d' }
      );
    });
  });

  describe('verifyAccessToken', () => {
    test('should verify valid access token', () => {
      const mockPayload = { userId: 'user123', role: 'user' };
      jwt.verify.mockReturnValue(mockPayload);

      const result = verifyAccessToken('valid-token');

      expect(jwt.verify).toHaveBeenCalledWith('valid-token', 'test-access-secret');
      expect(result).toEqual(mockPayload);
    });

    test('should throw error for invalid token', () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('jwt malformed');
      });

      expect(() => verifyAccessToken('invalid-token'))
        .toThrow('Invalid or expired token');
    });

    test('should throw error for expired token', () => {
      jwt.verify.mockImplementation(() => {
        const error = new Error('jwt expired');
        error.name = 'TokenExpiredError';
        throw error;
      });

      expect(() => verifyAccessToken('expired-token'))
        .toThrow('Invalid or expired token');
    });

    test('should use default secret when env var not set', () => {
      delete process.env.JWT_ACCESS_SECRET;
      jwt.verify.mockReturnValue({ userId: 'user123' });

      verifyAccessToken('token');

      expect(jwt.verify).toHaveBeenCalledWith('token', 'access-secret-change-me');
    });
  });

  describe('verifyRefreshToken', () => {
    test('should verify valid refresh token', () => {
      const mockPayload = { userId: 'user123' };
      jwt.verify.mockReturnValue(mockPayload);

      const result = verifyRefreshToken('valid-refresh-token');

      expect(jwt.verify).toHaveBeenCalledWith('valid-refresh-token', 'test-refresh-secret');
      expect(result).toEqual(mockPayload);
    });

    test('should throw error for invalid refresh token', () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('jwt malformed');
      });

      expect(() => verifyRefreshToken('invalid-refresh-token'))
        .toThrow('Invalid or expired refresh token');
    });

    test('should throw error for expired refresh token', () => {
      jwt.verify.mockImplementation(() => {
        const error = new Error('jwt expired');
        error.name = 'TokenExpiredError';
        throw error;
      });

      expect(() => verifyRefreshToken('expired-refresh-token'))
        .toThrow('Invalid or expired refresh token');
    });

    test('should use default secret when env var not set', () => {
      delete process.env.JWT_REFRESH_SECRET;
      jwt.verify.mockReturnValue({ userId: 'user123' });

      verifyRefreshToken('token');

      expect(jwt.verify).toHaveBeenCalledWith('token', 'refresh-secret-change-me');
    });
  });
});