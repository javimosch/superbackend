const express = require('express');
const request = require('supertest');

// Mock the controller
const mockAuthController = {
  register: jest.fn(),
  login: jest.fn(),
  refresh: jest.fn(),
  me: jest.fn(),
  githubLogin: jest.fn(),
  githubCallback: jest.fn(),
  githubRefreshToken: jest.fn()
};

// Mock the auth middleware
const mockAuthMiddleware = {
  authenticate: jest.fn((req, res, next) => {
    req.user = { id: 'test-user-id' };
    next();
  })
};

// Mock the audit middleware
const mockAuditMiddleware = {
  auditMiddleware: jest.fn().mockImplementation((action, options) => (req, res, next) => {
    req.auditAction = action;
    req.auditOptions = options;
    next();
  })
};

// Mock modules before requiring the routes
jest.mock('../controllers/auth.controller', () => mockAuthController);
jest.mock('../middleware/auth', () => mockAuthMiddleware);
jest.mock('../services/auditLogger', () => mockAuditMiddleware);

const authRoutes = require('./auth.routes');

describe('auth.routes', () => {
  let app;

  beforeAll(() => {
    // Audit middleware should be called during module load for each endpoint
    expect(mockAuditMiddleware.auditMiddleware).toHaveBeenCalledWith('public.auth.register', { entityType: 'User' });
    expect(mockAuditMiddleware.auditMiddleware).toHaveBeenCalledWith('public.auth.login', { entityType: 'User' });
    expect(mockAuditMiddleware.auditMiddleware).toHaveBeenCalledWith('public.auth.refresh', { entityType: 'User' });
    expect(mockAuditMiddleware.auditMiddleware).toHaveBeenCalledWith('public.auth.github.init', { entityType: 'User' });
    expect(mockAuditMiddleware.auditMiddleware).toHaveBeenCalledWith('public.auth.github.callback', { entityType: 'User' });
    expect(mockAuditMiddleware.auditMiddleware).toHaveBeenCalledWith('public.auth.github.refresh', { entityType: 'User' });
  });

  beforeEach(() => {
    // Reset controller mocks
    Object.values(mockAuthController).forEach(mock => mock.mockClear());
    mockAuthMiddleware.authenticate.mockClear();

    // Create express app
    app = express();
    app.use(express.json());
    app.use('/auth', authRoutes);
  });

  describe('POST /register', () => {
    it('should apply audit middleware with correct action', async () => {
      mockAuthController.register.mockImplementation((req, res) => {
        expect(req.auditAction).toBe('public.auth.register');
        expect(req.auditOptions).toEqual({ entityType: 'User' });
        res.status(201).json({ message: 'User registered' });
      });

      await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com', password: 'password123' })
        .expect(201);
    });

    it('should call authController.register', async () => {
      mockAuthController.register.mockImplementation((req, res) => {
        res.status(201).json({ token: 'test-token' });
      });

      await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com', password: 'password123', name: 'Test User' })
        .expect(201);

      expect(mockAuthController.register).toHaveBeenCalledTimes(1);
    });

    it('should handle successful registration', async () => {
      const mockResponse = {
        token: 'access-token',
        refreshToken: 'refresh-token',
        user: { id: '123', email: 'test@example.com' }
      };
      mockAuthController.register.mockImplementation((req, res) => {
        res.status(201).json(mockResponse);
      });

      const response = await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com', password: 'password123' })
        .expect(201);

      expect(response.body).toEqual(mockResponse);
    });

    it('should handle registration errors', async () => {
      const mockError = { error: 'Email already registered' };
      mockAuthController.register.mockImplementation((req, res) => {
        res.status(400).json(mockError);
      });

      const response = await request(app)
        .post('/auth/register')
        .send({ email: 'existing@example.com', password: 'password123' })
        .expect(400);

      expect(response.body).toEqual(mockError);
    });
  });

  describe('POST /login', () => {
    it('should apply audit middleware with correct action', async () => {
      mockAuthController.login.mockImplementation((req, res) => {
        expect(req.auditAction).toBe('public.auth.login');
        expect(req.auditOptions).toEqual({ entityType: 'User' });
        res.json({ message: 'Login successful' });
      });

      await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'password123' })
        .expect(200);
    });

    it('should call authController.login', async () => {
      mockAuthController.login.mockImplementation((req, res) => {
        res.json({ token: 'test-token' });
      });

      await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'password123' })
        .expect(200);

      expect(mockAuthController.login).toHaveBeenCalledTimes(1);
    });

    it('should handle successful login', async () => {
      const mockResponse = {
        token: 'access-token',
        refreshToken: 'refresh-token',
        user: { id: '123', email: 'test@example.com' }
      };
      mockAuthController.login.mockImplementation((req, res) => {
        res.json(mockResponse);
      });

      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'password123' })
        .expect(200);

      expect(response.body).toEqual(mockResponse);
    });

    it('should handle login errors', async () => {
      const mockError = { error: 'Invalid credentials' };
      mockAuthController.login.mockImplementation((req, res) => {
        res.status(401).json(mockError);
      });

      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'wrong-password' })
        .expect(401);

      expect(response.body).toEqual(mockError);
    });
  });

  describe('POST /refresh-token', () => {
    it('should apply audit middleware with correct action', async () => {
      mockAuthController.refresh.mockImplementation((req, res) => {
        expect(req.auditAction).toBe('public.auth.refresh');
        expect(req.auditOptions).toEqual({ entityType: 'User' });
        res.json({ message: 'Token refreshed' });
      });

      await request(app)
        .post('/auth/refresh-token')
        .send({ refreshToken: 'refresh-token' })
        .expect(200);
    });

    it('should call authController.refresh', async () => {
      mockAuthController.refresh.mockImplementation((req, res) => {
        res.json({ token: 'new-token' });
      });

      await request(app)
        .post('/auth/refresh-token')
        .send({ refreshToken: 'valid-refresh-token' })
        .expect(200);

      expect(mockAuthController.refresh).toHaveBeenCalledTimes(1);
    });

    it('should handle successful token refresh', async () => {
      const mockResponse = {
        token: 'new-access-token',
        refreshToken: 'new-refresh-token'
      };
      mockAuthController.refresh.mockImplementation((req, res) => {
        res.json(mockResponse);
      });

      const response = await request(app)
        .post('/auth/refresh-token')
        .send({ refreshToken: 'valid-refresh-token' })
        .expect(200);

      expect(response.body).toEqual(mockResponse);
    });
  });

  describe('GET /me', () => {
    it('should apply authenticate middleware', async () => {
      mockAuthController.me.mockImplementation((req, res) => {
        expect(req.user).toEqual({ id: 'test-user-id' });
        res.json({ user: req.user });
      });

      await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(mockAuthMiddleware.authenticate).toHaveBeenCalledTimes(1);
    });

    it('should call authController.me', async () => {
      mockAuthController.me.mockImplementation((req, res) => {
        res.json({ user: { id: '123', email: 'test@example.com' } });
      });

      await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(mockAuthController.me).toHaveBeenCalledTimes(1);
    });

    it('should return user info', async () => {
      const mockUser = { id: '123', email: 'test@example.com', name: 'Test User' };
      mockAuthController.me.mockImplementation((req, res) => {
        res.json({ user: mockUser });
      });

      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body).toEqual({ user: mockUser });
    });
  });

  describe('GitHub OAuth Routes', () => {
    describe('GET /github', () => {
      it('should apply audit middleware with correct action', async () => {
        mockAuthController.githubLogin.mockImplementation((req, res) => {
          expect(req.auditAction).toBe('public.auth.github.init');
          expect(req.auditOptions).toEqual({ entityType: 'User' });
          res.redirect('https://github.com/login/oauth/authorize');
        });

        await request(app)
          .get('/auth/github')
          .expect(302);
      });

      it('should call authController.githubLogin', async () => {
        mockAuthController.githubLogin.mockImplementation((req, res) => {
          res.redirect('https://github.com/login/oauth/authorize');
        });

        await request(app)
          .get('/auth/github')
          .expect(302);

        expect(mockAuthController.githubLogin).toHaveBeenCalledTimes(1);
      });
    });

    describe('GET /github/callback', () => {
      it('should apply audit middleware with correct action', async () => {
        mockAuthController.githubCallback.mockImplementation((req, res) => {
          expect(req.auditAction).toBe('public.auth.github.callback');
          expect(req.auditOptions).toEqual({ entityType: 'User' });
          res.json({ success: true });
        });

        await request(app)
          .get('/auth/github/callback?code=auth-code')
          .expect(200);
      });

      it('should call authController.githubCallback', async () => {
        mockAuthController.githubCallback.mockImplementation((req, res) => {
          res.json({ token: 'github-token' });
        });

        await request(app)
          .get('/auth/github/callback?code=auth-code')
          .expect(200);

        expect(mockAuthController.githubCallback).toHaveBeenCalledTimes(1);
      });

      it('should handle callback with auth code', async () => {
        mockAuthController.githubCallback.mockImplementation((req, res) => {
          expect(req.query.code).toBe('test-auth-code');
          res.json({ token: 'github-access-token' });
        });

        await request(app)
          .get('/auth/github/callback?code=test-auth-code')
          .expect(200);
      });
    });

    describe('POST /github/refresh-token', () => {
      it('should apply audit middleware with correct action', async () => {
        mockAuthController.githubRefreshToken.mockImplementation((req, res) => {
          expect(req.auditAction).toBe('public.auth.github.refresh');
          expect(req.auditOptions).toEqual({ entityType: 'User' });
          res.json({ success: true });
        });

        await request(app)
          .post('/auth/github/refresh-token')
          .send({ refreshToken: 'github-refresh-token' })
          .expect(200);
      });

      it('should call authController.githubRefreshToken', async () => {
        mockAuthController.githubRefreshToken.mockImplementation((req, res) => {
          res.json({ token: 'new-github-token' });
        });

        await request(app)
          .post('/auth/github/refresh-token')
          .send({ refreshToken: 'github-refresh-token' })
          .expect(200);

        expect(mockAuthController.githubRefreshToken).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Route Integration', () => {
    it('should handle all routes with proper middleware chain', async () => {
      mockAuthController.register.mockImplementation((req, res) => res.status(201).json({ success: true }));
      mockAuthController.login.mockImplementation((req, res) => res.json({ success: true }));
      mockAuthController.me.mockImplementation((req, res) => res.json({ success: true }));

      await request(app).post('/auth/register').send({}).expect(201);
      await request(app).post('/auth/login').send({}).expect(200);
      await request(app).get('/auth/me').expect(200);

      // Verify audit middleware was applied to registration and login
      expect(mockAuditMiddleware.auditMiddleware).toHaveBeenCalledTimes(6); // 6 routes with audit middleware

      // Verify auth middleware was applied to /me
      expect(mockAuthMiddleware.authenticate).toHaveBeenCalledTimes(1);
    });
  });
});