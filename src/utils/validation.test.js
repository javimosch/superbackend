const { validateEmail, validatePassword, sanitizeString } = require('./validation');

describe('validation.js', () => {
  describe('validateEmail', () => {
    test('identifies valid emails', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name@domain.co.uk')).toBe(true);
      expect(validateEmail('  trimmed@test.com  ')).toBe(true);
    });

    test('identifies invalid emails', () => {
      expect(validateEmail('invalid-email')).toBe(false);
      expect(validateEmail('no@domain')).toBe(false);
      expect(validateEmail('@no-user.com')).toBe(false);
      expect(validateEmail(null)).toBe(false);
      expect(validateEmail('')).toBe(false);
    });
  });

  describe('validatePassword', () => {
    test('validates minimum length', () => {
      expect(validatePassword('12345678')).toBe(true);
      expect(validatePassword('longerpassword123')).toBe(true);
      expect(validatePassword('1234567')).toBe(false);
      expect(validatePassword('')).toBe(false);
      expect(validatePassword(null)).toBe(false);
    });
  });

  describe('sanitizeString', () => {
    test('removes HTML tags and trims', () => {
      expect(sanitizeString('  <script>alert(1)</script>  ')).toBe('scriptalert(1)/script');
      expect(sanitizeString('<b>Hello</b>')).toBe('bHello/b');
      expect(sanitizeString('Normal string')).toBe('Normal string');
    });

    test('handles empty/null values', () => {
      expect(sanitizeString('')).toBe('');
      expect(sanitizeString(null)).toBe('');
      expect(sanitizeString(undefined)).toBe('');
    });
  });
});
