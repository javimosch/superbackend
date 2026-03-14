const axios = require('axios');
const crypto = require('crypto');

// Mock axios and globalSettingsService before requiring the service
jest.mock('axios');
jest.mock('./globalSettings.service', () => ({
  getSettingValue: jest.fn()
}));

const globalSettingsService = require('./globalSettings.service');

// Set env vars as fallback (global settings will override them)
process.env.GITHUB_CLIENT_ID = 'test_client_id';
process.env.GITHUB_CLIENT_SECRET = 'test_client_secret';
process.env.GITHUB_CALLBACK_URL = 'http://localhost:3000/api/auth/github/callback';

const githubService = require('./github.service');

describe('GitHub Service', () => {
  const mockClientId = 'test_client_id';
  const mockClientSecret = 'test_client_secret';
  const mockCallbackUrl = 'http://localhost:3000/api/auth/github/callback';

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: global settings return null, fallback to env vars
    globalSettingsService.getSettingValue.mockResolvedValue(null);
  });

  describe('getAuthURL', () => {
    test('should generate correct OAuth URL with state', async () => {
      const state = 'test_state_123';
      const authUrl = await githubService.getAuthURL(state);

      expect(authUrl).toContain('https://github.com/login/oauth/authorize');
      expect(authUrl).toContain(`client_id=${mockClientId}`);
      expect(authUrl).toContain(`redirect_uri=${encodeURIComponent(mockCallbackUrl)}`);
      expect(authUrl).toContain('scope=read%3Auser+user%3Aemail'); // URL encoded
      expect(authUrl).toContain(`state=${state}`);
    });

    test('should use global settings over env vars', async () => {
      const state = 'test_state_456';
      
      // Mock global settings returning different values
      globalSettingsService.getSettingValue.mockImplementation((key) => {
        if (key === 'github.oauth.clientId') return Promise.resolve('settings_client_id');
        if (key === 'github.oauth.clientSecret') return Promise.resolve('settings_secret');
        if (key === 'github.oauth.callbackUrl') return Promise.resolve('http://settings.com/callback');
        return Promise.resolve(null);
      });

      const authUrl = await githubService.getAuthURL(state);

      expect(authUrl).toContain('client_id=settings_client_id');
      expect(authUrl).toContain('redirect_uri=http%3A%2F%2Fsettings.com%2Fcallback');
    });
  });

  describe('getAccessToken', () => {
    test('should exchange code for access token successfully', async () => {
      const mockCode = 'auth_code_123';
      const mockState = 'state_123';
      const mockResponse = {
        data: {
          access_token: 'gho_access_token',
          refresh_token: 'ghr_refresh_token',
          scope: 'read:user user:email',
          token_type: 'bearer'
        }
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await githubService.getAccessToken(mockCode, mockState);

      expect(axios.post).toHaveBeenCalledWith(
        'https://github.com/login/oauth/access_token',
        {
          client_id: mockClientId,
          client_secret: mockClientSecret,
          code: mockCode,
          redirect_uri: mockCallbackUrl,
          state: mockState
        },
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }
      );

      expect(result).toEqual({
        accessToken: 'gho_access_token',
        refreshToken: 'ghr_refresh_token',
        scope: 'read:user user:email',
        tokenType: 'bearer'
      });
    });

    test('should throw error when GitHub returns error', async () => {
      const mockCode = 'invalid_code';
      const mockState = 'state_123';

      axios.post.mockResolvedValue({
        data: {
          error: 'bad_verification_code',
          error_description: 'The code passed is incorrect or expired'
        }
      });

      await expect(githubService.getAccessToken(mockCode, mockState))
        .rejects
        .toThrow('The code passed is incorrect or expired');
    });

    test('should use global settings for token exchange', async () => {
      const mockCode = 'auth_code_456';
      const mockState = 'state_456';
      const mockResponse = {
        data: {
          access_token: 'gho_token',
          refresh_token: 'ghr_token'
        }
      };

      globalSettingsService.getSettingValue.mockImplementation((key) => {
        if (key === 'github.oauth.clientId') return Promise.resolve('settings_id');
        if (key === 'github.oauth.clientSecret') return Promise.resolve('settings_secret');
        if (key === 'github.oauth.callbackUrl') return Promise.resolve('http://settings.com/cb');
        return Promise.resolve(null);
      });

      axios.post.mockResolvedValue(mockResponse);

      await githubService.getAccessToken(mockCode, mockState);

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          client_id: 'settings_id',
          client_secret: 'settings_secret',
          redirect_uri: 'http://settings.com/cb'
        }),
        expect.any(Object)
      );
    });
  });

  describe('getUserProfile', () => {
    test('should fetch user profile successfully', async () => {
      const mockAccessToken = 'gho_test_token';
      const mockResponse = {
        data: {
          id: 12345,
          login: 'testuser',
          name: 'Test User',
          email: 'test@example.com',
          avatar_url: 'https://avatars.githubusercontent.com/u/12345',
          html_url: 'https://github.com/testuser',
          company: 'Test Corp',
          location: 'San Francisco',
          bio: 'Test bio'
        }
      };

      axios.get.mockResolvedValue(mockResponse);

      const result = await githubService.getUserProfile(mockAccessToken);

      expect(axios.get).toHaveBeenCalledWith('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${mockAccessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      expect(result).toEqual({
        id: '12345',
        login: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
        avatarUrl: 'https://avatars.githubusercontent.com/u/12345',
        htmlUrl: 'https://github.com/testuser',
        company: 'Test Corp',
        location: 'San Francisco',
        bio: 'Test bio'
      });
    });

    test('should use login as name when name not provided', async () => {
      const mockAccessToken = 'gho_test_token';
      const mockResponse = {
        data: {
          id: 12345,
          login: 'testuser',
          avatar_url: 'https://avatars.githubusercontent.com/u/12345'
        }
      };

      axios.get.mockResolvedValue(mockResponse);

      const result = await githubService.getUserProfile(mockAccessToken);

      expect(result.name).toBe('testuser');
    });

    test('should handle GitHub API errors', async () => {
      const mockAccessToken = 'invalid_token';

      axios.get.mockRejectedValue({
        response: {
          data: {
            message: 'Bad credentials'
          },
          statusText: 'Unauthorized'
        }
      });

      await expect(githubService.getUserProfile(mockAccessToken))
        .rejects
        .toThrow('Bad credentials');
    });
  });

  describe('getUserEmails', () => {
    test('should fetch user emails and return primary verified', async () => {
      const mockAccessToken = 'gho_test_token';
      const mockResponse = {
        data: [
          { email: 'primary@example.com', primary: true, verified: true },
          { email: 'secondary@example.com', primary: false, verified: true },
          { email: 'unverified@example.com', primary: false, verified: false }
        ]
      };

      axios.get.mockResolvedValue(mockResponse);

      const result = await githubService.getUserEmails(mockAccessToken);

      expect(axios.get).toHaveBeenCalledWith('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `token ${mockAccessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      expect(result.primary).toBe('primary@example.com');
      expect(result.all).toHaveLength(3);
    });

    test('should return first verified email when no primary', async () => {
      const mockAccessToken = 'gho_test_token';
      const mockResponse = {
        data: [
          { email: 'verified@example.com', primary: false, verified: true },
          { email: 'unverified@example.com', primary: false, verified: false }
        ]
      };

      axios.get.mockResolvedValue(mockResponse);

      const result = await githubService.getUserEmails(mockAccessToken);

      expect(result.primary).toBe('verified@example.com');
    });

    test('should return first email when none verified', async () => {
      const mockAccessToken = 'gho_test_token';
      const mockResponse = {
        data: [
          { email: 'first@example.com', primary: false, verified: false }
        ]
      };

      axios.get.mockResolvedValue(mockResponse);

      const result = await githubService.getUserEmails(mockAccessToken);

      expect(result.primary).toBe('first@example.com');
    });
  });

  describe('refreshAccessToken', () => {
    test('should refresh access token successfully', async () => {
      const mockRefreshToken = 'ghr_old_refresh';
      const mockResponse = {
        data: {
          access_token: 'gho_new_access',
          refresh_token: 'ghr_new_refresh',
          scope: 'read:user user:email',
          token_type: 'bearer'
        }
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await githubService.refreshAccessToken(mockRefreshToken);

      expect(axios.post).toHaveBeenCalledWith(
        'https://github.com/login/oauth/access_token',
        {
          client_id: mockClientId,
          client_secret: mockClientSecret,
          grant_type: 'refresh_token',
          refresh_token: mockRefreshToken
        },
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }
      );

      expect(result).toEqual({
        accessToken: 'gho_new_access',
        refreshToken: 'ghr_new_refresh',
        scope: 'read:user user:email',
        tokenType: 'bearer'
      });
    });

    test('should keep old refresh token if new one not provided', async () => {
      const mockRefreshToken = 'ghr_old_refresh';
      const mockResponse = {
        data: {
          access_token: 'gho_new_access',
          scope: 'read:user user:email',
          token_type: 'bearer'
        }
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await githubService.refreshAccessToken(mockRefreshToken);

      expect(result.refreshToken).toBe(mockRefreshToken);
    });

    test('should use global settings for token refresh', async () => {
      const mockRefreshToken = 'ghr_old';
      const mockResponse = {
        data: {
          access_token: 'gho_new'
        }
      };

      globalSettingsService.getSettingValue.mockImplementation((key) => {
        if (key === 'github.oauth.clientId') return Promise.resolve('settings_id');
        if (key === 'github.oauth.clientSecret') return Promise.resolve('settings_secret');
        return Promise.resolve(null);
      });

      axios.post.mockResolvedValue(mockResponse);

      await githubService.refreshAccessToken(mockRefreshToken);

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          client_id: 'settings_id',
          client_secret: 'settings_secret'
        }),
        expect.any(Object)
      );
    });
  });

  describe('generateState', () => {
    test('should generate cryptographically secure state', () => {
      const state1 = githubService.generateState();
      const state2 = githubService.generateState();

      expect(state1).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(state2).toHaveLength(64);
      expect(state1).not.toBe(state2);
    });
  });

  describe('verifyState', () => {
    test('should return true for matching states', () => {
      const state = 'test_state_123';
      expect(githubService.verifyState(state, state)).toBe(true);
    });

    test('should return false for mismatched states', () => {
      expect(githubService.verifyState('state1', 'state2')).toBe(false);
    });

    test('should return false for null/undefined states', () => {
      expect(githubService.verifyState(null, 'state')).toBe(false);
      expect(githubService.verifyState('state', null)).toBe(false);
      expect(githubService.verifyState(undefined, undefined)).toBe(false);
    });
  });

  describe('getFullUserInfo', () => {
    test('should combine profile and email info', async () => {
      const mockAccessToken = 'gho_test_token';
      
      githubService.getUserProfile = jest.fn().mockResolvedValue({
        id: '12345',
        login: 'testuser',
        name: 'Test User',
        email: null,
        avatarUrl: 'https://avatar.url',
        emailVerified: false
      });

      githubService.getUserEmails = jest.fn().mockResolvedValue({
        primary: 'test@example.com',
        all: []
      });

      const result = await githubService.getFullUserInfo(mockAccessToken);

      expect(result.email).toBe('test@example.com');
      expect(result.emailVerified).toBe(true);
    });
  });
});
