const fs = require('fs');
const path = require('path');

// Save the truly original console before anything is overridden
const realConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug
};

const consoleOverride = require('./consoleOverride.service');

describe('Console Override Service Integration Tests', () => {
  const testLogFile = 'integration-test-stdout.log';
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

  describe('Basic Functionality', () => {
    test('should initialize and log to file', (done) => {
      process.env.NODE_ENV = 'development';
      
      consoleOverride.init({ logFile: testLogFile });
      
      setTimeout(() => {
        expect(consoleOverride.isActive()).toBe(true);
        
        // Test logging
        console.log('Integration test message');
        console.error('Integration test error');
        
        // Wait for async file writing
        setTimeout(() => {
          expect(fs.existsSync(testLogFile)).toBe(true);
          
          const logContent = fs.readFileSync(testLogFile, 'utf8');
          expect(logContent).toContain('Integration test message');
          expect(logContent).toContain('Integration test error');
          
          done();
        }, 50);
      }, 50);
    });

    test('should not initialize in production', () => {
      process.env.NODE_ENV = 'production';
      
      consoleOverride.init({ logFile: testLogFile });
      
      expect(consoleOverride.isActive()).toBe(false);
      expect(fs.existsSync(testLogFile)).toBe(false);
    });

    test('should restore original console', (done) => {
      process.env.NODE_ENV = 'development';
      
      consoleOverride.init({ logFile: testLogFile });
      
      // Wait for async initialization
      setTimeout(() => {
        expect(console.log).not.toBe(realConsole.log);
        
        consoleOverride.restore();
        expect(console.log).toBe(realConsole.log);
        expect(consoleOverride.isActive()).toBe(false);
        done();
      }, 50);
    });
  });

  describe('Service API', () => {
    test('should provide correct log path', (done) => {
      process.env.NODE_ENV = 'development';
      
      consoleOverride.init({ logFile: testLogFile });
      
      // Wait for async initialization
      setTimeout(() => {
        const logPath = consoleOverride.getLogPath();
        expect(logPath).toContain(testLogFile);
        done();
      }, 50);
    });

    test('should return null for log path when not active', () => {
      process.env.NODE_ENV = 'production';
      
      consoleOverride.init({ logFile: testLogFile });
      
      const logPath = consoleOverride.getLogPath();
      expect(logPath).toBeNull();
    });
  });
});
