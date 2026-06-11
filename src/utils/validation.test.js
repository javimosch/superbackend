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

    test('strips quotes and backticks', () => {
      expect(sanitizeString('he"llo')).toBe('hello');
      expect(sanitizeString("he'llo")).toBe('hello');
      expect(sanitizeString('he`llo')).toBe('hello');
    });

    test('strips javascript protocol', () => {
      expect(sanitizeString('javascript:alert(1)')).toBe('alert(1)');
      expect(sanitizeString('JAVASCRIPT:alert(1)')).toBe('alert(1)');
    });

    test('strips event handler attributes', () => {
      expect(sanitizeString('onclick=alert(1)')).toBe('alert(1)');
      expect(sanitizeString('onmouseover=alert(1)')).toBe('alert(1)');
    });

    test('strips HTML entities', () => {
      expect(sanitizeString('&lt;script&gt;')).toBe('script');
      expect(sanitizeString('&#60;script&#62;')).toBe('script');
      expect(sanitizeString('&amp;')).toBe('');
    });

    test('strips entity-encoded javascript protocol', () => {
      expect(sanitizeString('javascrip&#116;:alert(1)')).toBe('javascrip:alert(1)');
      expect(sanitizeString('&#106;avascript:alert(1)')).toBe('avascript:alert(1)');
    });

    test('strips entity-encoded event handlers', () => {
      expect(sanitizeString('onclic&#107;=alert(1)')).toBe('alert(1)');
      expect(sanitizeString('&#111;nclick=alert(1)')).toBe('nclick=alert(1)');
    });

    test('strips entity after bogus entity removal', () => {
      expect(sanitizeString('&tab;javascript:alert(1)')).toBe('alert(1)');
    });

    test('handles empty/null values', () => {
      expect(sanitizeString('')).toBe('');
      expect(sanitizeString(null)).toBe('');
      expect(sanitizeString(undefined)).toBe('');
    });
  });
});
