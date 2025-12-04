const { register, login, refresh, me } = require('./auth.controller');
const User = require('../models/User');
const jwt = require('../utils/jwt');

jest.mock('../utils/asyncHandler', () => (fn) => fn);

// Mock dependencies
jest.mock('../models/User');
jest.mock('../utils/jwt');

describe('Auth Controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockReq = {
      body: {},
      user: null
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  describe('register', () => {
    test('should register new user successfully', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'password123'
      };

      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        role: 'user',
        save: jest.fn().mockResolvedValue(),
        toJSON: jest.fn().mockReturnValue({ _id: 'user123', email: 'test@example.com' })
      };

      User.findOne.mockResolvedValue(null); // No existing user
      User.mockImplementation(() => mockUser);
      jwt.generateAccessToken.mockReturnValue('access_token_123');
      jwt.generateRefreshToken.mockReturnValue('refresh_token_123');

      await register(mockReq, mockRes);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(mockUser.save).toHaveBeenCalled();
      expect(jwt.generateAccessToken).toHaveBeenCalledWith('user123', 'user');
      expect(jwt.generateRefreshToken).toHaveBeenCalledWith('user123');
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        token: 'access_token_123',
        refreshToken: 'refresh_token_123',
        user: { _id: 'user123', email: 'test@example.com' }
      });
    });

    test('should return 400 when email is missing', async () => {
      mockReq.body = { password: 'password123' };

      await register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Email and password are required' });
    });

    test('should return 400 when password is missing', async () => {
      mockReq.body = { email: 'test@example.com' };

      await register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Email and password are required' });
    });

    test('should return 400 when password is too short', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: '12345'
      };

      await register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Password must be at least 6 characters' });
    });

    test('should return 400 when email already exists', async () => {
      mockReq.body = {
        email: 'existing@example.com',
        password: 'password123'
      };

      User.findOne.mockResolvedValue({ _id: 'existing_user' });

      await register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Email already registered' });
    });

    test('should convert email to lowercase', async () => {
      mockReq.body = {
        email: 'TEST@EXAMPLE.COM',
        password: 'password123'
      };

      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        role: 'user',
        save: jest.fn().mockResolvedValue(),
        toJSON: jest.fn().mockReturnValue({ _id: 'user123', email: 'test@example.com' })
      };

      User.findOne.mockResolvedValue(null);
      User.mockImplementation(() => mockUser);
      jwt.generateAccessToken.mockReturnValue('token');
      jwt.generateRefreshToken.mockReturnValue('refresh');

      await register(mockReq, mockRes);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(User).toHaveBeenCalledWith({
        email: 'test@example.com',
        passwordHash: 'password123'
      });
    });
  });

  describe('login', () => {
    test('should login user successfully', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'password123'
      };

      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        role: 'user',
        comparePassword: jest.fn().mockResolvedValue(true),
        toJSON: jest.fn().mockReturnValue({ _id: 'user123', email: 'test@example.com' })
      };

      User.findOne.mockResolvedValue(mockUser);
      jwt.generateAccessToken.mockReturnValue('access_token_123');
      jwt.generateRefreshToken.mockReturnValue('refresh_token_123');

      await login(mockReq, mockRes);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(mockUser.comparePassword).toHaveBeenCalledWith('password123');
      expect(jwt.generateAccessToken).toHaveBeenCalledWith('user123', 'user');
      expect(jwt.generateRefreshToken).toHaveBeenCalledWith('user123');
      expect(mockRes.json).toHaveBeenCalledWith({
        token: 'access_token_123',
        refreshToken: 'refresh_token_123',
        user: { _id: 'user123', email: 'test@example.com' }
      });
    });

    test('should return 400 when email is missing', async () => {
      mockReq.body = { password: 'password123' };

      await login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Email and password are required' });
    });

    test('should return 400 when password is missing', async () => {
      mockReq.body = { email: 'test@example.com' };

      await login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Email and password are required' });
    });

    test('should return 401 when user not found', async () => {
      mockReq.body = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      User.findOne.mockResolvedValue(null);

      await login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid email or password' });
    });

    test('should return 401 when password is incorrect', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      const mockUser = {
        comparePassword: jest.fn().mockResolvedValue(false)
      };

      User.findOne.mockResolvedValue(mockUser);

      await login(mockReq, mockRes);

      expect(mockUser.comparePassword).toHaveBeenCalledWith('wrongpassword');
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid email or password' });
    });

    test('should convert email to lowercase for login', async () => {
      mockReq.body = {
        email: 'TEST@EXAMPLE.COM',
        password: 'password123'
      };

      User.findOne.mockResolvedValue(null);

      await login(mockReq, mockRes);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
    });
  });

  describe('refresh', () => {
    test('should refresh tokens successfully', async () => {
      mockReq.body = { refreshToken: 'valid_refresh_token' };

      jwt.verifyRefreshToken.mockReturnValue({ userId: 'user123' });
      jwt.generateAccessToken.mockReturnValue('new_access_token');
      jwt.generateRefreshToken.mockReturnValue('new_refresh_token');

      await refresh(mockReq, mockRes);

      expect(jwt.verifyRefreshToken).toHaveBeenCalledWith('valid_refresh_token');
      expect(jwt.generateAccessToken).toHaveBeenCalledWith('user123');
      expect(jwt.generateRefreshToken).toHaveBeenCalledWith('user123');
      expect(mockRes.json).toHaveBeenCalledWith({
        token: 'new_access_token',
        refreshToken: 'new_refresh_token'
      });
    });

    test('should return 400 when refresh token is missing', async () => {
      mockReq.body = {};

      await refresh(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Refresh token required' });
    });

    test('should handle null refresh token', async () => {
      mockReq.body = { refreshToken: null };

      await refresh(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Refresh token required' });
    });
  });

  describe('me', () => {
    test('should return current user data', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        role: 'user',
        toJSON: jest.fn().mockReturnValue({ _id: 'user123', email: 'test@example.com', role: 'user' })
      };

      mockReq.user = mockUser;

      await me(mockReq, mockRes);

      expect(mockUser.toJSON).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        user: { _id: 'user123', email: 'test@example.com', role: 'user' }
      });
    });

  });
});