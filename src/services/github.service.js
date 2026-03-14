const axios = require('axios');
const crypto = require('crypto');
const globalSettingsService = require('./globalSettings.service');

class GitHubService {
  constructor() {
    this.clientId = null;
    this.clientSecret = null;
    this.callbackUrl = null;
    this.baseURL = 'https://github.com';
    this.apiBaseURL = 'https://api.github.com';
    
    // OAuth scopes requested
    this.scopes = ['read:user', 'user:email'];
  }

  /**
   * Get GitHub OAuth credentials from global settings or environment variables
   * Global settings take precedence over env vars
   */
  async getCredentials() {
    // Try global settings first (they override env vars)
    const clientId = await globalSettingsService.getSettingValue('github.oauth.clientId');
    const clientSecret = await globalSettingsService.getSettingValue('github.oauth.clientSecret');
    const callbackUrl = await globalSettingsService.getSettingValue('github.oauth.callbackUrl');

    return {
      clientId: clientId || process.env.GITHUB_CLIENT_ID,
      clientSecret: clientSecret || process.env.GITHUB_CLIENT_SECRET,
      callbackUrl: callbackUrl || process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/api/auth/github/callback'
    };
  }

  /**
   * Generate OAuth authorization URL
   * @param {string} state - CSRF protection state parameter
   * @returns {string} GitHub OAuth URL
   */
  async getAuthURL(state) {
    const credentials = await this.getCredentials();
    
    if (!credentials.clientId) {
      throw new Error('GITHUB_CLIENT_ID not configured');
    }

    const params = new URLSearchParams({
      client_id: credentials.clientId,
      redirect_uri: credentials.callbackUrl,
      scope: this.scopes.join(' '),
      state: state
    });

    return `${this.baseURL}/login/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   * @param {string} code - Authorization code from GitHub callback
   * @param {string} state - State parameter to verify
   * @returns {Promise<object>} Token response
   */
  async getAccessToken(code, state) {
    const credentials = await this.getCredentials();
    
    if (!credentials.clientId || !credentials.clientSecret) {
      throw new Error('GitHub OAuth credentials not configured');
    }

    try {
      const response = await axios.post(
        `${this.baseURL}/login/oauth/access_token`,
        {
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          code: code,
          redirect_uri: credentials.callbackUrl,
          state: state
        },
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.error) {
        throw new Error(response.data.error_description || response.data.error);
      }

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        scope: response.data.scope,
        tokenType: response.data.token_type
      };
    } catch (error) {
      if (error.response) {
        throw new Error(`GitHub token exchange failed: ${error.response.data.error_description || error.response.statusText}`);
      }
      throw new Error(`GitHub token exchange failed: ${error.message}`);
    }
  }

  /**
   * Get user profile from GitHub API
   * @param {string} accessToken - GitHub access token
   * @returns {Promise<object>} GitHub user profile
   */
  async getUserProfile(accessToken) {
    try {
      const response = await axios.get(`${this.apiBaseURL}/user`, {
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      return {
        id: String(response.data.id),
        login: response.data.login,
        name: response.data.name || response.data.login,
        email: response.data.email,
        avatarUrl: response.data.avatar_url,
        htmlUrl: response.data.html_url,
        company: response.data.company,
        location: response.data.location,
        bio: response.data.bio
      };
    } catch (error) {
      if (error.response) {
        throw new Error(`GitHub API error: ${error.response.data.message || error.response.statusText}`);
      }
      throw new Error(`Failed to fetch GitHub profile: ${error.message}`);
    }
  }

  /**
   * Get user emails from GitHub API
   * @param {string} accessToken - GitHub access token
   * @returns {Promise<Array>} List of user emails
   */
  async getUserEmails(accessToken) {
    try {
      const response = await axios.get(`${this.apiBaseURL}/user/emails`, {
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      // Return primary verified email or first verified email
      const emails = response.data || [];
      const primaryEmail = emails.find(e => e.primary && e.verified);
      const verifiedEmail = emails.find(e => e.verified);
      
      return {
        primary: primaryEmail?.email || verifiedEmail?.email || emails[0]?.email,
        all: emails
      };
    } catch (error) {
      if (error.response) {
        throw new Error(`GitHub API error: ${error.response.data.message || error.response.statusText}`);
      }
      throw new Error(`Failed to fetch GitHub emails: ${error.message}`);
    }
  }

  /**
   * Refresh access token (if refresh token is available)
   * @param {string} refreshToken - GitHub refresh token
   * @returns {Promise<object>} New token response
   */
  async refreshAccessToken(refreshToken) {
    const credentials = await this.getCredentials();
    
    if (!credentials.clientId || !credentials.clientSecret) {
      throw new Error('GitHub OAuth credentials not configured');
    }

    try {
      const response = await axios.post(
        `${this.baseURL}/login/oauth/access_token`,
        {
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        },
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.error) {
        throw new Error(response.data.error_description || response.data.error);
      }

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token || refreshToken,
        scope: response.data.scope,
        tokenType: response.data.token_type
      };
    } catch (error) {
      if (error.response) {
        throw new Error(`GitHub token refresh failed: ${error.response.data.error_description || error.response.statusText}`);
      }
      throw new Error(`GitHub token refresh failed: ${error.message}`);
    }
  }

  /**
   * Generate a cryptographically secure state parameter
   * @returns {string} State parameter for CSRF protection
   */
  generateState() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Verify state parameter matches
   * @param {string} provided - State from callback
   * @param {string} expected - Expected state
   * @returns {boolean} True if valid
   */
  verifyState(provided, expected) {
    if (!provided || !expected) return false;
    return crypto.timingSafeEqual(
      Buffer.from(provided),
      Buffer.from(expected)
    );
  }

  /**
   * Get full user info including email
   * @param {string} accessToken - GitHub access token
   * @returns {Promise<object>} Complete user profile
   */
  async getFullUserInfo(accessToken) {
    const profile = await this.getUserProfile(accessToken);
    const emails = await this.getUserEmails(accessToken);
    
    return {
      ...profile,
      email: profile.email || emails.primary,
      emailVerified: !!emails.primary
    };
  }
}

module.exports = new GitHubService();
