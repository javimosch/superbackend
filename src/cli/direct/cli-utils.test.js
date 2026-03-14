const { colorize, parseArgs, formatOutput, colors } = require('./cli-utils');

describe('cli-utils', () => {
  describe('colorize', () => {
    test('wraps text with reset code', () => {
      const result = colorize('red', 'error');
      expect(result).toBe(`\x1b[31merror\x1b[0m`);
    });

    test('handles bold color', () => {
      const result = colorize('bold', 'title');
      expect(result).toBe(`\x1b[1mtitle\x1b[0m`);
    });

    test('handles green color', () => {
      const result = colorize('green', 'success');
      expect(result).toBe(`\x1b[32msuccess\x1b[0m`);
    });
  });

  describe('parseArgs', () => {
    test('parses resource and command positional args', () => {
      const result = parseArgs(['agents', 'list']);
      expect(result.resource).toBe('agents');
      expect(result.command).toBe('list');
    });

    test('parses resource, command, and id', () => {
      const result = parseArgs(['users', 'get', '507f1f77bcf86cd799439011']);
      expect(result.resource).toBe('users');
      expect(result.command).toBe('get');
      expect(result.id).toBe('507f1f77bcf86cd799439011');
    });

    test('parses string options', () => {
      const result = parseArgs([
        'agents', 'create', '--name', 'MyAgent', '--model', 'gpt-4',
        '--key', 'API_KEY', '--value', 'test', '--description', 'desc',
        '--email', 'test@example.com', '--password', 'secret',
        '--role', 'admin', '--alias', 'my-alias', '--json', '{"a":1}'
      ]);
      expect(result.name).toBe('MyAgent');
      expect(result.model).toBe('gpt-4');
      expect(result.key).toBe('API_KEY');
      expect(result.value).toBe('test');
      expect(result.description).toBe('desc');
      expect(result.email).toBe('test@example.com');
      expect(result.password).toBe('secret');
      expect(result.role).toBe('admin');
      expect(result.alias).toBe('my-alias');
      expect(result.json).toBe('{"a":1}');
    });

    test('parses --output option', () => {
      expect(parseArgs(['--output', 'table']).output).toBe('table');
      expect(parseArgs(['--output', 'TEXT']).output).toBe('text');
    });

    test('parses boolean flags', () => {
      const result = parseArgs(['--quiet', '--verbose', '--yes']);
      expect(result.quiet).toBe(true);
      expect(result.verbose).toBe(true);
      expect(result.yes).toBe(true);
    });

    test('parses -y as yes', () => {
      expect(parseArgs(['-y']).yes).toBe(true);
    });

    test('parses -h and --help as help', () => {
      expect(parseArgs(['-h']).help).toBe(true);
      expect(parseArgs(['--help']).help).toBe(true);
    });

    test('returns default values', () => {
      const result = parseArgs([]);
      expect(result.output).toBe('json');
      expect(result.quiet).toBe(false);
      expect(result.verbose).toBe(false);
      expect(result.help).toBe(false);
    });
  });

  describe('formatOutput', () => {
    test('formats as JSON by default', () => {
      const data = { id: 1, name: 'test' };
      const result = formatOutput(data, 'json');
      expect(result).toBe(JSON.stringify(data, null, 2));
    });

    test('formats string as-is in text mode', () => {
      const result = formatOutput('plain text', 'text');
      expect(result).toBe('plain text');
    });

    test('formats object as JSON in text mode', () => {
      const data = { id: 1 };
      const result = formatOutput(data, 'text');
      expect(result).toBe(JSON.stringify(data, null, 2));
    });

    test('formats array as table', () => {
      const data = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' }
      ];
      const result = formatOutput(data, 'table');
      expect(result).toContain('ID | NAME');
      expect(result).toContain('1 | Alice');
      expect(result).toContain('2 | Bob');
    });

    test('handles null values in table', () => {
      const data = [{ id: 1, name: null }];
      const result = formatOutput(data, 'table');
      expect(result).toContain('1 |');
    });

    test('handles object values in table', () => {
      const data = [{ id: 1, meta: { foo: 'bar' } }];
      const result = formatOutput(data, 'table');
      expect(result).toContain('{"foo":"bar"}');
    });

    test('returns JSON for non-array in table mode', () => {
      const data = { id: 1 };
      const result = formatOutput(data, 'table');
      expect(result).toBe(JSON.stringify(data, null, 2));
    });
  });
});
