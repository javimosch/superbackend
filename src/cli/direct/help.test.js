const { printHelp } = require('./help');

describe('help', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('printHelp', () => {
    test('prints usage section', () => {
      printHelp();
      const output = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(output).toContain('Usage:');
      expect(output).toContain('node src/cli/direct.js <resource> <command>');
    });

    test('prints resources section', () => {
      printHelp();
      const output = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(output).toContain('Resources & Commands:');
      expect(output).toContain('agents');
      expect(output).toContain('users');
      expect(output).toContain('settings');
    });

    test('prints options section', () => {
      printHelp();
      const output = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(output).toContain('Options:');
      expect(output).toContain('--name');
      expect(output).toContain('--output');
      expect(output).toContain('--quiet');
    });
  });
});
