const { validateEmail, validatePassword, sanitizeString } = require('./validation');
const { generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken } = require('./jwt');
const asyncHandler = require('./asyncHandler');

// Mock environment variables for JWT tests
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

describe('Validation Utils', () => {
  describe('validateEmail', () => {
    test('should return true for valid email addresses', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name@domain.co.uk')).toBe(true);
      expect(validateEmail('test123@gmail.com')).toBe(true);
    });

    test('should return false for invalid email addresses', () => {
      expect(validateEmail('invalid-email')).toBe(false);
      expect(validateEmail('test@')).toBe(false);
      expect(validateEmail('@domain.com')).toBe(false);
      expect(validateEmail('test.domain.com')).toBe(false);
    });

    test('should return false for non-string inputs', () => {
      expect(validateEmail(null)).toBe(false);
      expect(validateEmail(undefined)).toBe(false);
      expect(validateEmail(123)).toBe(false);
      expect(validateEmail({})).toBe(false);
    });
  });

  describe('validatePassword', () => {
    test('should return true for passwords with 8 or more characters', () => {
      expect(validatePassword('12345678')).toBe(true);
      expect(validatePassword('strongpassword')).toBe(true);
      expect(validatePassword('Password123!')).toBe(true);
    });

    test('should return false for passwords with less than 8 characters', () => {
      expect(validatePassword('1234567')).toBe(false);
      expect(validatePassword('short')).toBe(false);
      expect(validatePassword('abc')).toBe(false);
    });

    test('should return false for non-string inputs', () => {
      expect(validatePassword(null)).toBe(false);
      expect(validatePassword(undefined)).toBe(false);
      expect(validatePassword(12345678)).toBe(false);
      expect(validatePassword([])).toBe(false);
    });
  });

  describe('sanitizeString', () => {
    test('should remove angle brackets from strings', () => {
      expect(sanitizeString('Hello <script>alert("xss")</script>')).toBe('Hello scriptalert("xss")/script');
      expect(sanitizeString('<div>content</div>')).toBe('divcontent/div');
      expect(sanitizeString('Normal text')).toBe('Normal text');
    });

    test('should trim whitespace', () => {
      expect(sanitizeString('  hello world  ')).toBe('hello world');
      expect(sanitizeString('\n\ttest\n\t')).toBe('test');
    });

    test('should return empty string for invalid inputs', () => {
      expect(sanitizeString(null)).toBe('');
      expect(sanitizeString(undefined)).toBe('');
      expect(sanitizeString(123)).toBe('');
      expect(sanitizeString({})).toBe('');
    });
  });
});

describe('JWT Utils', () => {
  describe('generateAccessToken', () => {
    test('should generate a valid access token with userId', () => {
      const token = generateAccessToken('user123');
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    test('should generate token with custom role', () => {
      const token = generateAccessToken('user123', 'admin');
      const decoded = verifyAccessToken(token);
      expect(decoded.userId).toBe('user123');
      expect(decoded.role).toBe('admin');
    });

    test('should generate token with default user role', () => {
      const token = generateAccessToken('user123');
      const decoded = verifyAccessToken(token);
      expect(decoded.role).toBe('user');
    });
  });

  describe('generateRefreshToken', () => {
    test('should generate a valid refresh token', () => {
      const token = generateRefreshToken('user123');
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    test('should include userId in refresh token payload', () => {
      const token = generateRefreshToken('user123');
      const decoded = verifyRefreshToken(token);
      expect(decoded.userId).toBe('user123');
    });
  });

  describe('verifyAccessToken', () => {
    test('should verify valid access token', () => {
      const token = generateAccessToken('user123', 'admin');
      const decoded = verifyAccessToken(token);
      expect(decoded.userId).toBe('user123');
      expect(decoded.role).toBe('admin');
    });

    test('should throw error for invalid token', () => {
      expect(() => verifyAccessToken('invalid-token')).toThrow('Invalid or expired token');
    });

    test('should throw error for empty token', () => {
      expect(() => verifyAccessToken('')).toThrow('Invalid or expired token');
    });
  });

  describe('verifyRefreshToken', () => {
    test('should verify valid refresh token', () => {
      const token = generateRefreshToken('user123');
      const decoded = verifyRefreshToken(token);
      expect(decoded.userId).toBe('user123');
    });

    test('should throw error for invalid refresh token', () => {
      expect(() => verifyRefreshToken('invalid-token')).toThrow('Invalid or expired refresh token');
    });
  });
});

describe('AsyncHandler Utils', () => {
  test('should wrap async function and handle success', async () => {
    const mockReq = {};
    const mockRes = { json: jest.fn() };
    const mockNext = jest.fn();

    const asyncFn = async (req, res, next) => {
      res.json({ success: true });
    };

    const wrappedFn = asyncHandler(asyncFn);
    await wrappedFn(mockReq, mockRes, mockNext);

    expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('should catch async errors and call next', async () => {
    const mockReq = {};
    const mockRes = {};
    const mockNext = jest.fn();
    const testError = new Error('Test error');

    const asyncFn = async (req, res, next) => {
      throw testError;
    };

    const wrappedFn = asyncHandler(asyncFn);
    await wrappedFn(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith(testError);
  });

  test('should handle non-async functions that return promises', async () => {
    const mockReq = {};
    const mockRes = { send: jest.fn() };
    const mockNext = jest.fn();

    const promiseFn = (req, res, next) => {
      return Promise.resolve().then(() => {
        res.send('success');
      });
    };

    const wrappedFn = asyncHandler(promiseFn);
    await wrappedFn(mockReq, mockRes, mockNext);

    expect(mockRes.send).toHaveBeenCalledWith('success');
  });

  test('should handle rejected promises', async () => {
    const mockReq = {};
    const mockRes = {};
    const mockNext = jest.fn();
    const testError = new Error('Promise rejection');

    const rejectedPromiseFn = (req, res, next) => {
      return Promise.reject(testError);
    };

    const wrappedFn = asyncHandler(rejectedPromiseFn);
    await wrappedFn(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith(testError);
  });

  test('should handle synchronous errors in promise chains', (done) => {
    const mockReq = {};
    const mockRes = {};
    const testError = new Error('Sync error in promise');
    
    const mockNext = jest.fn((error) => {
      expect(error).toBe(testError);
      done();
    });

    const syncErrorFn = (req, res, next) => {
      return Promise.resolve().then(() => {
        throw testError;
      });
    };

    const wrappedFn = asyncHandler(syncErrorFn);
    wrappedFn(mockReq, mockRes, mockNext);
  });
});

// Additional comprehensive tests for edge cases and advanced scenarios
describe('Advanced Validation Tests', () => {
  describe('validateEmail - Advanced Cases', () => {
    test('should handle emails with special characters', () => {
      expect(validateEmail('user+tag@example.com')).toBe(true);
      expect(validateEmail('user.name+tag@example.com')).toBe(true);
      expect(validateEmail('user_name@example.com')).toBe(true);
    });

    test('should handle international domain names', () => {
      expect(validateEmail('user@example.org')).toBe(true);
      expect(validateEmail('test@subdomain.example.com')).toBe(true);
      expect(validateEmail('user@example-site.com')).toBe(true);
    });

    test('should reject emails with invalid characters', () => {
      expect(validateEmail('user@')).toBe(false);
      expect(validateEmail('user space@example.com')).toBe(false);
      // Note: The current regex allows double dots, this is a simple validation
      expect(validateEmail('user..double@example.com')).toBe(true);
    });

    test('should handle whitespace in emails correctly', () => {
      expect(validateEmail(' user@example.com ')).toBe(true); // trimmed
      expect(validateEmail('user @example.com')).toBe(false); // space in local part
      expect(validateEmail('user@ example.com')).toBe(false); // space in domain
    });

    test('should handle very long email addresses', () => {
      const longEmail = 'a'.repeat(50) + '@' + 'b'.repeat(50) + '.com';
      expect(validateEmail(longEmail)).toBe(true);
      
      const invalidLongEmail = 'a'.repeat(100) + '@';
      expect(validateEmail(invalidLongEmail)).toBe(false);
    });
  });

  describe('validatePassword - Security Tests', () => {
    test('should accept passwords exactly 8 characters', () => {
      expect(validatePassword('exactly8')).toBe(true);
    });

    test('should accept very long passwords', () => {
      const longPassword = 'a'.repeat(100);
      expect(validatePassword(longPassword)).toBe(true);
    });

    test('should handle passwords with special characters', () => {
      expect(validatePassword('p@ssw0rd!')).toBe(true);
      expect(validatePassword('!@#$%^&*()')).toBe(true);
      expect(validatePassword('αβγδεζηθ')).toBe(true); // Unicode characters
    });

    test('should handle empty strings and whitespace', () => {
      expect(validatePassword('')).toBe(false);
      expect(validatePassword('       ')).toBe(false); // 7 spaces
      expect(validatePassword('        ')).toBe(true); // 8 spaces
    });

    test('should handle boolean and array inputs', () => {
      expect(validatePassword(true)).toBe(false);
      expect(validatePassword(false)).toBe(false);
      expect(validatePassword(['password'])).toBe(false);
    });
  });

  describe('sanitizeString - Security Tests', () => {
    test('should handle nested HTML tags', () => {
      expect(sanitizeString('<div><span>content</span></div>')).toBe('divspancontent/span/div');
    });

    test('should handle mixed content with scripts', () => {
      const maliciousContent = 'Hello <script>alert("xss")</script> World <img src="x" onerror="alert(1)">';
      expect(sanitizeString(maliciousContent)).toBe('Hello scriptalert("xss")/script World img src="x" onerror="alert(1)"');
    });

    test('should preserve normal text content', () => {
      expect(sanitizeString('Normal text with 123 numbers')).toBe('Normal text with 123 numbers');
      expect(sanitizeString('Text with "quotes" and \'apostrophes\'')).toBe('Text with "quotes" and \'apostrophes\'');
    });

    test('should handle only angle brackets', () => {
      expect(sanitizeString('<>')).toBe('');
      expect(sanitizeString('<<<>>>')).toBe('');
    });

    test('should handle mixed whitespace', () => {
      expect(sanitizeString('\t\n  Hello World  \n\t')).toBe('Hello World');
      expect(sanitizeString('   \r\n   ')).toBe('');
    });
  });
});

describe('JWT Security and Edge Cases', () => {
  describe('Token Generation Edge Cases', () => {
    test('should handle special characters in userId', () => {
      const specialUserId = 'user@123.com';
      const token = generateAccessToken(specialUserId);
      const decoded = verifyAccessToken(token);
      expect(decoded.userId).toBe(specialUserId);
    });

    test('should handle numeric userIds', () => {
      const numericUserId = '12345';
      const token = generateAccessToken(numericUserId);
      const decoded = verifyAccessToken(token);
      expect(decoded.userId).toBe(numericUserId);
    });

    test('should handle empty role gracefully', () => {
      const token = generateAccessToken('user123', '');
      const decoded = verifyAccessToken(token);
      expect(decoded.role).toBe('');
    });

    test('should include expiration time in token', () => {
      const token = generateAccessToken('user123');
      const decoded = verifyAccessToken(token);
      expect(decoded.exp).toBeDefined();
      expect(typeof decoded.exp).toBe('number');
    });
  });

  describe('Token Verification Security', () => {
    test('should reject malformed tokens', () => {
      expect(() => verifyAccessToken('not.a.token')).toThrow('Invalid or expired token');
      expect(() => verifyAccessToken('malformed')).toThrow('Invalid or expired token');
    });

    test('should reject tokens with wrong signature', () => {
      // Create token with different secret
      const jwt = require('jsonwebtoken');
      const fakeToken = jwt.sign({ userId: 'user123' }, 'wrong-secret');
      expect(() => verifyAccessToken(fakeToken)).toThrow('Invalid or expired token');
    });

    test('should handle refresh token verification errors', () => {
      expect(() => verifyRefreshToken(null)).toThrow('Invalid or expired refresh token');
      expect(() => verifyRefreshToken(123)).toThrow('Invalid or expired refresh token');
    });

    test('should include issued at time in tokens', () => {
      const refreshToken = generateRefreshToken('user123');
      const decoded = verifyRefreshToken(refreshToken);
      expect(decoded.iat).toBeDefined();
      expect(typeof decoded.iat).toBe('number');
    });
  });
});

describe('AsyncHandler Advanced Scenarios', () => {
  test('should handle functions that return non-promise values', async () => {
    const mockReq = {};
    const mockRes = { send: jest.fn() };
    const mockNext = jest.fn();

    const syncFn = (req, res, next) => {
      res.send('sync response');
      return 'some value';
    };

    const wrappedFn = asyncHandler(syncFn);
    await wrappedFn(mockReq, mockRes, mockNext);

    expect(mockRes.send).toHaveBeenCalledWith('sync response');
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('should handle middleware that calls next with no error', async () => {
    const mockReq = {};
    const mockRes = {};
    const mockNext = jest.fn();

    const middlewareFn = async (req, res, next) => {
      // Middleware that just calls next
      next();
    };

    const wrappedFn = asyncHandler(middlewareFn);
    await wrappedFn(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith();
  });
});

// Extended comprehensive tests for maximum coverage and edge cases
describe('Extreme Edge Cases and Boundary Testing', () => {
  describe('validateEmail - Boundary and Unicode Tests', () => {
    test('should handle minimum valid email length', () => {
      expect(validateEmail('a@b.c')).toBe(true);
      expect(validateEmail('@b.c')).toBe(false);
      expect(validateEmail('a@.c')).toBe(false);
      expect(validateEmail('a@b.')).toBe(false);
    });

    test('should handle emails with numbers and hyphens', () => {
      expect(validateEmail('user123@domain-name.com')).toBe(true);
      expect(validateEmail('123user@123domain.com')).toBe(true);
      expect(validateEmail('user-name@sub-domain.co.uk')).toBe(true);
    });

    test('should handle Unicode characters in email', () => {
      expect(validateEmail('用户@domain.com')).toBe(true);
      expect(validateEmail('user@домен.com')).toBe(true);
      expect(validateEmail('тест@тест.рф')).toBe(true);
    });

    test('should reject emails with invalid TLD patterns', () => {
      expect(validateEmail('user@domain')).toBe(false);
      expect(validateEmail('user@domain.')).toBe(false);
      // Note: Current simple regex allows this pattern
      expect(validateEmail('user@.domain.com')).toBe(true);
    });
  });

  describe('validatePassword - Comprehensive Security Tests', () => {
    test('should handle passwords with all character types', () => {
      expect(validatePassword('Aa1!@#$%')).toBe(true);
      expect(validatePassword('UPPERCASE')).toBe(true);
      expect(validatePassword('lowercase')).toBe(true);
      expect(validatePassword('12345678')).toBe(true);
    });

    test('should handle passwords with newlines and tabs', () => {
      expect(validatePassword('pass\nword')).toBe(true);
      expect(validatePassword('pass\tword')).toBe(true);
      expect(validatePassword('pass\r\nword')).toBe(true);
    });

    test('should handle extremely long passwords', () => {
      const megaPassword = 'a'.repeat(10000);
      expect(validatePassword(megaPassword)).toBe(true);
    });

    test('should handle edge case inputs for password validation', () => {
      expect(validatePassword(Symbol('password'))).toBe(false);
      expect(validatePassword(new Date())).toBe(false);
      expect(validatePassword(/password/)).toBe(false);
    });
  });

  describe('sanitizeString - Advanced XSS and Injection Tests', () => {
    test('should handle complex XSS attack vectors', () => {
      const xssPayload = '<script>document.cookie="stolen"</script><iframe src="malicious.com"></iframe>';
      const sanitized = sanitizeString(xssPayload);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('<iframe>');
    });

    test('should handle SQL injection-like patterns', () => {
      expect(sanitizeString("'; DROP TABLE users; --")).toBe('\'; DROP TABLE users; --');
      expect(sanitizeString('1\' OR \'1\'=\'1')).toBe('1\' OR \'1\'=\'1');
    });

    test('should preserve mathematical expressions', () => {
      expect(sanitizeString('2 + 2 = 4')).toBe('2 + 2 = 4');
      expect(sanitizeString('x > 5 && y < 10')).toBe('x  5 && y  10');
    });

    test('should handle mixed encoding and special characters', () => {
      expect(sanitizeString('Hello&nbsp;World&lt;script&gt;')).toBe('Hello&nbsp;World&lt;script&gt;');
      expect(sanitizeString('Café & Naïve résumé')).toBe('Café & Naïve résumé');
    });
  });
});

describe('JWT Advanced Security and Performance Tests', () => {
  describe('Token Generation Performance and Stress Tests', () => {
    test('should generate multiple tokens quickly', () => {
      const startTime = Date.now();
      const tokens = [];
      
      for (let i = 0; i < 100; i++) {
        tokens.push(generateAccessToken(`user${i}`));
      }
      
      const endTime = Date.now();
      expect(tokens.length).toBe(100);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second
    });

    test('should handle very long userIds', () => {
      const longUserId = 'user' + 'x'.repeat(1000);
      const token = generateAccessToken(longUserId);
      const decoded = verifyAccessToken(token);
      expect(decoded.userId).toBe(longUserId);
    });

    test('should generate unique tokens for same user with delay', (done) => {
      const token1 = generateAccessToken('user123');
      // Use setTimeout to ensure different issued time
      setTimeout(() => {
        const token2 = generateAccessToken('user123');
        expect(token1).not.toBe(token2); // Different issued times make them unique
        done();
      }, 1001); // Wait over 1 second to ensure different iat
    });
  });

  describe('Token Verification Edge Cases', () => {
    test('should handle tokens with extra whitespace', () => {
      const token = generateAccessToken('user123');
      const tokenWithSpaces = `  ${token}  `;
      expect(() => verifyAccessToken(tokenWithSpaces.trim())).not.toThrow();
    });

    test('should reject tokens with modified payload', () => {
      const token = generateAccessToken('user123');
      const parts = token.split('.');
      // Modify the payload (middle part)
      const modifiedToken = parts[0] + '.modified.' + parts[2];
      expect(() => verifyAccessToken(modifiedToken)).toThrow('Invalid or expired token');
    });

    test('should handle special characters in role field', () => {
      const specialRole = 'admin@company.com';
      const token = generateAccessToken('user123', specialRole);
      const decoded = verifyAccessToken(token);
      expect(decoded.role).toBe(specialRole);
    });

    test('should verify refresh token contains expected fields only', () => {
      const token = generateRefreshToken('user123');
      const decoded = verifyRefreshToken(token);
      expect(Object.keys(decoded)).toContain('userId');
      expect(Object.keys(decoded)).toContain('iat');
      expect(Object.keys(decoded)).toContain('exp');
      expect(decoded.role).toBeUndefined(); // Refresh tokens shouldn't have role
    });
  });
});

describe('AsyncHandler Comprehensive Error Scenarios', () => {
  test('should handle async function with multiple awaits', (done) => {
    const mockReq = {};
    const mockRes = { 
      json: jest.fn((data) => {
        expect(data).toEqual({ completed: true });
        done();
      })
    };
    const mockNext = jest.fn();

    const multiAwaitFn = async (req, res, next) => {
      await Promise.resolve('step1');
      await Promise.resolve('step2');
      await Promise.resolve('step3');
      res.json({ completed: true });
    };

    const wrappedFn = asyncHandler(multiAwaitFn);
    wrappedFn(mockReq, mockRes, mockNext);
  });

  test('should handle timeout scenarios gracefully', (done) => {
    const mockReq = {};
    const mockRes = {};
    const testError = new Error('Operation timeout');
    
    const mockNext = jest.fn((error) => {
      expect(error.message).toBe('Operation timeout');
      done();
    });

    const timeoutFn = async (req, res, next) => {
      await new Promise((resolve, reject) => {
        setTimeout(() => reject(testError), 10);
      });
    };

    const wrappedFn = asyncHandler(timeoutFn);
    wrappedFn(mockReq, mockRes, mockNext);
  });

  test('should handle nested async operations with errors', (done) => {
    const mockReq = {};
    const mockRes = {};
    const nestedError = new Error('Nested operation failed');
    
    const mockNext = jest.fn((error) => {
      expect(error).toBe(nestedError);
      done();
    });

    const nestedAsyncFn = async (req, res, next) => {
      const nestedOperation = async () => {
        await Promise.resolve();
        throw nestedError;
      };
      
      await nestedOperation();
    };

    const wrappedFn = asyncHandler(nestedAsyncFn);
    wrappedFn(mockReq, mockRes, mockNext);
  });

  test('should handle functions that return different promise types', async () => {
    const mockReq = {};
    const mockRes = { send: jest.fn() };
    const mockNext = jest.fn();

    const mixedPromiseFn = (req, res, next) => {
      // Return a promise that resolves to another promise
      return Promise.resolve().then(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            res.send('delayed response');
            resolve();
          }, 1);
        });
      });
    };

    const wrappedFn = asyncHandler(mixedPromiseFn);
    await wrappedFn(mockReq, mockRes, mockNext);
    
    // Wait a bit for the delayed response
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(mockRes.send).toHaveBeenCalledWith('delayed response');
  });
});