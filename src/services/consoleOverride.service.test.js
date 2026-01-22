const fs = require('fs');
const path = require('path');
const consoleOverride = require('./consoleOverride.service');

describe('Console Override Service', () => {
  const testLogFile = 'test-stdout.log';
  let originalEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };
    
    // Clean up test log file
    if (fs.existsSync(testLogFile)) {
      fs.unlinkSync(testLogFile);
    }
    
    // Reset service state
    consoleOverride.restore();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    
    // Clean up test log file
    if (fs.existsSync(testLogFile)) {
      fs.unlinkSync(testLogFile);
    }
    
    // Reset service state
    consoleOverride.restore();
  });

  describe('Initialization', () => {
    test('should initialize in development environment', () => {
      process.env.NODE_ENV = 'development';
      
      consoleOverride.init({ logFile: testLogFile });
      
      expect(consoleOverride.isActive()).toBe(true);
      expect(consoleOverride.getLogPath()).toContain(testLogFile);
    });

    test('should not initialize in production environment', () => {
      process.env.NODE_ENV = 'production';
      
      consoleOverride.init({ logFile: testLogFile });
      
      expect(consoleOverride.isActive()).toBe(false);
      expect(consoleOverride.getLogPath()).toBeNull();
    });

    test('should force initialize in production when enabled', () => {
      process.env.NODE_ENV = 'production';
      process.env.CONSOLE_OVERRIDE_ENABLED = 'true';
      
      consoleOverride.init({ logFile: testLogFile });
      
      expect(consoleOverride.isActive()).toBe(true);
      expect(consoleOverride.getLogPath()).toContain(testLogFile);
    });

    test('should not initialize when force disabled', () => {
      process.env.NODE_ENV = 'development';
      process.env.CONSOLE_OVERRIDE_ENABLED = 'false';
      
      consoleOverride.init({ logFile: testLogFile });
      
      expect(consoleOverride.isActive()).toBe(false);
      expect(consoleOverride.getLogPath()).toBeNull();
    });
  });

  describe('Logging Behavior', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      consoleOverride.init({ logFile: testLogFile });
    });

    test('should log to both console and file', () => {
      const testMessage = 'Test log message';
      
      console.log(testMessage);
      
      // Check file exists and contains message
      expect(fs.existsSync(testLogFile)).toBe(true);
      const logContent = fs.readFileSync(testLogFile, 'utf8');
      expect(logContent).toContain(testMessage);
    });

    test('should handle multiple console methods', () => {
      const messages = {
        log: 'Log message',
        error: 'Error message',
        warn: 'Warning message',
        info: 'Info message',
        debug: 'Debug message'
      };
      
      Object.entries(messages).forEach(([method, message]) => {
        console[method](message);
      });
      
      const logContent = fs.readFileSync(testLogFile, 'utf8');
      Object.values(messages).forEach(message => {
        expect(logContent).toContain(message);
      });
    });

    test('should handle objects in console output', () => {
      const testObject = { key: 'value', nested: { prop: 'test' } };
      
      console.log(testObject);
      
      const logContent = fs.readFileSync(testLogFile, 'utf8');
      expect(logContent).toContain('key');
      expect(logContent).toContain('value');
      expect(logContent).toContain('nested');
    });

    test('should handle multiple arguments', () => {
      console.log('Message', 123, { obj: 'test' }, [1, 2, 3]);
      
      const logContent = fs.readFileSync(testLogFile, 'utf8');
      expect(logContent).toContain('Message');
      expect(logContent).toContain('123');
      expect(logContent).toContain('obj');
      expect(logContent).toContain('[1,2,3]');
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid file path gracefully', () => {
      process.env.NODE_ENV = 'development';
      
      // Mock fs.createWriteStream to throw an error
      const originalCreateWriteStream = fs.createWriteStream;
      fs.createWriteStream = jest.fn(() => {
        throw new Error('ENOENT: no such file or directory');
      });
      
      // Try to write to an invalid path - should handle gracefully
      consoleOverride.init({ logFile: '/invalid/path/test.log' });
      
      // Should not be active due to error
      expect(consoleOverride.isActive()).toBe(false);
      
      // Restore original function
      fs.createWriteStream = originalCreateWriteStream;
    });

    test('should prevent infinite recursion on write errors', () => {
      process.env.NODE_ENV = 'development';
      
      // Mock a failing stream
      const originalCreateWriteStream = fs.createWriteStream;
      fs.createWriteStream = jest.fn(() => ({
        write: jest.fn(() => { throw new Error('Write failed'); }),
        destroyed: false,
        end: jest.fn(),
        path: testLogFile,
        on: jest.fn() // Add the missing 'on' method
      }));
      
      consoleOverride.init({ logFile: testLogFile });
      
      // Should not crash when trying to log
      expect(() => {
        console.log('Test message');
      }).not.toThrow();
      
      // Restore original function
      fs.createWriteStream = originalCreateWriteStream;
    });
  });

  describe('Service Management', () => {
    test('should restore original console', () => {
      process.env.NODE_ENV = 'development';
      
      const originalConsoleLog = console.log;
      consoleOverride.init({ logFile: testLogFile });
      
      expect(console.log).not.toBe(originalConsoleLog);
      
      consoleOverride.restore();
      
      expect(console.log).toBe(originalConsoleLog);
      expect(consoleOverride.isActive()).toBe(false);
    });

    test('should not initialize multiple times', () => {
      process.env.NODE_ENV = 'development';
      
      consoleOverride.init({ logFile: testLogFile });
      const firstLogPath = consoleOverride.getLogPath();
      
      consoleOverride.init({ logFile: 'different.log' });
      const secondLogPath = consoleOverride.getLogPath();
      
      expect(firstLogPath).toBe(secondLogPath);
    });
  });
});
