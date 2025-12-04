const { authenticate, basicAuth, requireAdmin } = require('./auth');
const jwt = require('../utils/jwt');
const User = require('../models/User');

// Mock dependencies
jest.mock('../utils/jwt');
jest.mock('../models/User');

describe('Auth Middleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockReq = {
      headers: {},
      user: null
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn()
    };
    
    mockNext = jest.fn();
    
    // Setup environment variables
    process.env.ADMIN_USERNAME = 'testadmin';
    process.env.ADMIN_PASSWORD = 'testpass';
  });

  describe('authenticate', () => {
    test('should authenticate user with valid token', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        role: 'user'
      };

      mockReq.headers.authorization = 'Bearer valid_token_123';
      jwt.verifyAccessToken.mockReturnValue({ userId: 'user123', role: 'user' });
      User.findById.mockResolvedValue(mockUser);

      await authenticate(mockReq, mockRes, mockNext);

      expect(jwt.verifyAccessToken).toHaveBeenCalledWith('valid_token_123');
      expect(User.findById).toHaveBeenCalledWith('user123');
      expect(mockReq.user).toBe(mockUser);
      expect(mockNext).toHaveBeenCalled();
    });

    test('should return 401 when no token provided', async () => {
      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'No token provided' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should return 401 when invalid token format', async () => {
      mockReq.headers.authorization = 'InvalidFormat token123';

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'No token provided' });
    });

    test('should return 401 when token verification fails', async () => {
      mockReq.headers.authorization = 'Bearer invalid_token';
      jwt.verifyAccessToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    test('should return 401 when user not found', async () => {
      mockReq.headers.authorization = 'Bearer valid_token_123';
      jwt.verifyAccessToken.mockReturnValue({ userId: 'nonexistent', role: 'user' });
      User.findById.mockResolvedValue(null);

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    test('should handle errors without message', async () => {
      mockReq.headers.authorization = 'Bearer valid_token_123';
      jwt.verifyAccessToken.mockImplementation(() => {
        throw new Error();
      });

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication failed' });
    });
  });

  describe('basicAuth', () => {
    test('should authenticate with valid credentials', () => {
      const credentials = Buffer.from('testadmin:testpass').toString('base64');
      mockReq.headers.authorization = `Basic ${credentials}`;

      basicAuth(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('should return 401 when no authorization header', () => {
      basicAuth(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Basic realm="Admin Area"');
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    test('should return 401 when not Basic auth', () => {
      mockReq.headers.authorization = 'Bearer some-token';

      basicAuth(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    test('should return 401 when invalid credentials', () => {
      const credentials = Buffer.from('wronguser:wrongpass').toString('base64');
      mockReq.headers.authorization = `Basic ${credentials}`;

      basicAuth(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    test('should use default credentials when env vars not set', () => {
      delete process.env.ADMIN_USERNAME;
      delete process.env.ADMIN_PASSWORD;
      
      const credentials = Buffer.from('admin:admin').toString('base64');
      mockReq.headers.authorization = `Basic ${credentials}`;

      basicAuth(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requireAdmin', () => {
    test('should allow access for admin user', () => {
      mockReq.user = { role: 'admin', _id: 'admin123' };

      requireAdmin(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('should return 401 when no user in request', () => {
      requireAdmin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    test('should return 403 when user is not admin', () => {
      mockReq.user = { role: 'user', _id: 'user123' };

      requireAdmin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Admin access required' });
    });
  });
});