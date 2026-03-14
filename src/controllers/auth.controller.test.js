const { register, login, refresh, me, githubLogin, githubCallback, githubRefreshToken } = require('./auth.controller');
const User = require('../models/User');
const jwt = require('../utils/jwt');
const githubService = require('../services/github.service');

jest.mock('../utils/asyncHandler', () => (fn) => fn);

// Mock dependencies
jest.mock('../models/User');
jest.mock('../utils/jwt');
jest.mock('../services/github.service');

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

  describe('githubLogin', () => {
    test('should redirect to GitHub OAuth URL', async () => {
      mockReq.query = {};
      mockReq.headers = { accept: 'text/html' };
      
      const mockState = 'test_state_123';
      const mockAuthUrl = 'https://github.com/login/oauth/authorize?client_id=test';
      
      githubService.generateState.mockReturnValue(mockState);
      githubService.getAuthURL.mockReturnValue(mockAuthUrl);

      mockRes.redirect = jest.fn();

      await githubLogin(mockReq, mockRes);

      expect(githubService.generateState).toHaveBeenCalled();
      expect(githubService.getAuthURL).toHaveBeenCalledWith(mockState);
      expect(mockRes.redirect).toHaveBeenCalledWith(mockAuthUrl);
    });

    test('should return JSON when requested', async () => {
      mockReq.query = { json: 'true' };
      mockReq.headers = { accept: 'application/json' };
      
      const mockState = 'test_state_456';
      const mockAuthUrl = 'https://github.com/login/oauth/authorize?client_id=test';
      
      githubService.generateState.mockReturnValue(mockState);
      githubService.getAuthURL.mockReturnValue(mockAuthUrl);

      await githubLogin(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        authUrl: mockAuthUrl,
        state: mockState
      });
    });

    test('should store state in session if available', async () => {
      mockReq.query = {};
      mockReq.headers = { accept: 'text/html' };
      mockReq.session = {};
      
      const mockState = 'test_state_789';
      const mockAuthUrl = 'https://github.com/login/oauth/authorize';
      
      githubService.generateState.mockReturnValue(mockState);
      githubService.getAuthURL.mockReturnValue(mockAuthUrl);
      mockRes.redirect = jest.fn();

      await githubLogin(mockReq, mockRes);

      expect(mockReq.session.githubOAuthState).toBe(mockState);
    });
  });

  describe('githubCallback', () => {
    test('should return 400 when authorization code is missing', async () => {
      mockReq.query = {};

      await githubCallback(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authorization code missing' });
    });

    test('should return 400 when state parameter is invalid', async () => {
      mockReq.query = { code: 'test_code', state: 'invalid_state' };
      mockReq.session = { githubOAuthState: 'expected_state' };

      await githubCallback(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid state parameter' });
    });

    test('should create new user with GitHub login', async () => {
      const mockCode = 'test_code';
      const mockState = 'test_state';
      
      mockReq.query = { code: mockCode, state: mockState };
      mockReq.session = { githubOAuthState: mockState };
      mockReq.headers = { accept: 'application/json' };
      mockReq.query.json = 'true';

      const mockTokenResponse = {
        accessToken: 'gh_access_token',
        refreshToken: 'gh_refresh_token'
      };

      const mockGithubUser = {
        id: '12345',
        login: 'testuser',
        name: 'Test User',
        email: 'test@github.com',
        avatarUrl: 'https://avatar.url',
        emailVerified: true
      };

      const mockUser = {
        _id: 'user123',
        email: 'test@github.com',
        githubId: '12345',
        githubUsername: 'testuser',
        role: 'user',
        save: jest.fn().mockResolvedValue(),
        toJSON: jest.fn().mockReturnValue({
          _id: 'user123',
          email: 'test@github.com',
          githubId: '12345',
          githubUsername: 'testuser',
          name: 'Test User'
        })
      };

      githubService.getAccessToken.mockResolvedValue(mockTokenResponse);
      githubService.getFullUserInfo.mockResolvedValue(mockGithubUser);
      User.findOne.mockResolvedValue(null); // No existing user
      User.mockImplementation(() => mockUser);
      jwt.generateAccessToken.mockReturnValue('jwt_access_token');
      jwt.generateRefreshToken.mockReturnValue('jwt_refresh_token');
      mockRes.redirect = jest.fn();

      await githubCallback(mockReq, mockRes);

      expect(githubService.getAccessToken).toHaveBeenCalledWith(mockCode, mockState);
      expect(githubService.getFullUserInfo).toHaveBeenCalledWith(mockTokenResponse.accessToken);
      expect(User.findOne).toHaveBeenCalledTimes(2); // Once for githubId, once for email
      expect(User).toHaveBeenCalledWith(expect.objectContaining({
        email: 'test@github.com',
        githubId: '12345',
        githubUsername: 'testuser',
        name: 'Test User'
      }));
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        token: 'jwt_access_token',
        refreshToken: 'jwt_refresh_token',
        user: expect.any(Object)
      });
    });

    test('should link GitHub account to existing user by email', async () => {
      const mockCode = 'test_code';
      const mockState = 'test_state';
      
      mockReq.query = { code: mockCode, state: mockState };
      mockReq.session = { githubOAuthState: mockState };
      mockReq.headers = { accept: 'application/json' };
      mockReq.query.json = 'true';

      const mockTokenResponse = {
        accessToken: 'gh_access_token'
      };

      const mockGithubUser = {
        id: '12345',
        login: 'testuser',
        name: 'Test User',
        email: 'existing@example.com',
        avatarUrl: 'https://avatar.url',
        emailVerified: true
      };

      const existingUser = {
        _id: 'existing123',
        email: 'existing@example.com',
        githubId: null,
        githubAccessToken: null,
        save: jest.fn().mockResolvedValue(),
        toJSON: jest.fn().mockReturnValue({
          _id: 'existing123',
          email: 'existing@example.com'
        })
      };

      githubService.getAccessToken.mockResolvedValue(mockTokenResponse);
      githubService.getFullUserInfo.mockResolvedValue(mockGithubUser);
      User.findOne.mockImplementation((query) => {
        if (query.githubId) return null; // No user with this GitHub ID
        return Promise.resolve(existingUser); // But user exists with this email
      });
      jwt.generateAccessToken.mockReturnValue('jwt_token');
      jwt.generateRefreshToken.mockReturnValue('jwt_refresh');
      mockRes.redirect = jest.fn();

      await githubCallback(mockReq, mockRes);

      expect(existingUser.githubId).toBe('12345');
      expect(existingUser.githubUsername).toBe('testuser');
      expect(existingUser.githubAccessToken).toBe('gh_access_token');
      expect(existingUser.save).toHaveBeenCalled();
    });

    test('should update existing GitHub user tokens', async () => {
      const mockCode = 'test_code';
      const mockState = 'test_state';
      
      mockReq.query = { code: mockCode, state: mockState };
      mockReq.session = { githubOAuthState: mockState };
      mockReq.headers = { accept: 'application/json' };
      mockReq.query.json = 'true';

      const mockTokenResponse = {
        accessToken: 'new_access_token'
      };

      const mockGithubUser = {
        id: '12345',
        login: 'testuser',
        name: 'Updated Name',
        email: 'test@github.com',
        avatarUrl: 'https://new.avatar.url',
        emailVerified: true
      };

      const existingGithubUser = {
        _id: 'user123',
        email: 'test@github.com',
        githubId: '12345',
        githubUsername: 'oldusername',
        githubAccessToken: 'old_token',
        save: jest.fn().mockResolvedValue(),
        toJSON: jest.fn().mockReturnValue({
          _id: 'user123',
          email: 'test@github.com',
          githubId: '12345'
        })
      };

      githubService.getAccessToken.mockResolvedValue(mockTokenResponse);
      githubService.getFullUserInfo.mockResolvedValue(mockGithubUser);
      User.findOne.mockImplementation((query) => {
        if (query.githubId === '12345') return Promise.resolve(existingGithubUser);
        return null;
      });
      jwt.generateAccessToken.mockReturnValue('jwt_token');
      jwt.generateRefreshToken.mockReturnValue('jwt_refresh');
      mockRes.redirect = jest.fn();

      await githubCallback(mockReq, mockRes);

      expect(existingGithubUser.githubAccessToken).toBe('new_access_token');
      expect(existingGithubUser.githubUsername).toBe('testuser');
      expect(existingGithubUser.save).toHaveBeenCalled();
    });
  });

  describe('githubRefreshToken', () => {
    test('should refresh GitHub access token successfully', async () => {
      mockReq.body = { refreshToken: 'old_refresh_token' };

      const mockTokenResponse = {
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token'
      };

      githubService.refreshAccessToken.mockResolvedValue(mockTokenResponse);

      await githubRefreshToken(mockReq, mockRes);

      expect(githubService.refreshAccessToken).toHaveBeenCalledWith('old_refresh_token');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token'
      });
    });

    test('should return 400 when refresh token is missing', async () => {
      mockReq.body = {};

      await githubRefreshToken(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Refresh token required' });
    });

    test('should handle refresh token error', async () => {
      mockReq.body = { refreshToken: 'invalid_token' };

      githubService.refreshAccessToken.mockRejectedValue(new Error('Invalid refresh token'));

      await githubRefreshToken(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid refresh token' });
    });
  });
});