const fs = require('fs');
const path = require('path');

let originalConsole = null;
let logFileStream = null;
let isActive = false;
let isWriting = false;
let memoryInterval = null;
let logLines = [];
const MAX_LOG_LINES = 2000;

/**
 * Console Override Service
 * Provides dual logging to stdout and file in non-production environments
 */
const consoleOverride = {
  /**
   * Initialize console override
   * @param {Object} options - Configuration options
   * @param {string} options.logFile - Log file path (default: 'stdout.log')
   * @param {boolean} options.forceEnable - Force enable regardless of NODE_ENV
   */
  init(options = {}) {
    if (isActive) {
      return; // Already initialized
    }

    const nodeEnv = process.env.NODE_ENV || 'development';
    const forceEnabled = options.forceEnable || process.env.CONSOLE_OVERRIDE_ENABLED === 'true';
    const forceDisabled = process.env.CONSOLE_OVERRIDE_ENABLED === 'false';

    // Skip if production and not force enabled, or if force disabled
    if ((nodeEnv === 'production' && !forceEnabled) || forceDisabled) {
      return;
    }

    const logFile = options.logFile || process.env.CONSOLE_LOG_FILE || 'stdout.log';
    const logPath = path.resolve(process.cwd(), logFile);

    try {
      // Close any existing stream before truncating
      if (logFileStream && !logFileStream.destroyed) {
        logFileStream.end();
        logFileStream = null;
      }
      
      // Wait a bit for stream to fully close, then truncate
      setTimeout(() => {
        // Truncate log file on initialization (start with empty file)
        if (fs.existsSync(logPath)) {
          fs.truncateSync(logPath, 0);
        }
        
        // Create file stream for appending with error handling
        logFileStream = fs.createWriteStream(logPath, { flags: 'a' });
        
        // Handle stream errors
        logFileStream.on('error', (error) => {
          if (originalConsole && originalConsole.error && !isWriting) {
            originalConsole.error('❌ Log stream error:', error.message);
          }
          isActive = false;
        });
        
        // Store original console
        originalConsole = { ...console };
        
        // Override console methods
        this._overrideConsoleMethods();
        
        // Start memory management interval (1 minute)
        this._startMemoryManagement();
        
        isActive = true;
        
        // Log initialization using original console to avoid recursion
        const initMsg = `📝 Console override initialized - logging to ${logPath}`;
        originalConsole.log(initMsg);
        this._writeToFile(initMsg);
      }, 10);
      
    } catch (error) {
      // Fallback to console-only logging
      originalConsole = originalConsole || console;
      originalConsole.error('❌ Console override failed:', error.message);
      isActive = false;
    }
  },

  /**
   * Override individual console methods
   * @private
   */
  _overrideConsoleMethods() {
    const methods = ['log', 'error', 'warn', 'info', 'debug'];
    
    methods.forEach(method => {
      console[method] = (...args) => {
        // Call original console method
        originalConsole[method](...args);
        
        // Write to file if stream is available and not already writing
        if (logFileStream && !logFileStream.destroyed && !isWriting) {
          this._writeToFile(args);
        }
      };
    });
  },

  /**
   * Write message to file
   * @param {string|Array} message - Message to write
   * @private
   */
  _writeToFile(message) {
    if (!logFileStream || logFileStream.destroyed) {
      return;
    }

    isWriting = true;
    try {
      const messageStr = Array.isArray(message) 
        ? message.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ')
        : String(message);
      
      // Add to memory buffer
      logLines.push(messageStr);
      
      // Only write if stream is available and not in the middle of a rewrite
      if (logFileStream && !logFileStream.destroyed) {
        logFileStream.write(messageStr + '\n');
      }
    } catch (writeError) {
      // Prevent infinite recursion - use original console for errors
      if (originalConsole && originalConsole.error && !isWriting) {
        originalConsole.error('❌ Log write error:', writeError.message);
      }
    } finally {
      isWriting = false;
    }
  },

  /**
   * Start memory management interval
   * @private
   */
  _startMemoryManagement() {
    // Clear any existing interval
    if (memoryInterval) {
      clearInterval(memoryInterval);
    }
    
    // Set up 1-minute interval to manage log lines
    memoryInterval = setInterval(() => {
      this._manageLogMemory();
    }, 60000); // 1 minute
  },

  /**
   * Manage log memory by keeping only last MAX_LOG_LINES
   * @private
   */
  _manageLogMemory() {
    if (logLines.length > MAX_LOG_LINES) {
      // Keep only the last MAX_LOG_LINES
      const excessLines = logLines.length - MAX_LOG_LINES;
      logLines = logLines.slice(excessLines);
      
      // Rewrite the log file with only the recent lines
      this._rewriteLogFile();
    }
  },

  /**
   * Rewrite log file with current memory buffer
   * @private
   */
  _rewriteLogFile() {
    if (!logFileStream || !logFileStream.path) {
      return;
    }

    try {
      const logPath = logFileStream.path;
      
      // Write recent lines to file (this truncates the file)
      const fileContent = logLines.join('\n') + '\n';
      fs.writeFileSync(logPath, fileContent, { flag: 'w' });
      
      // Reopen stream for appending
      logFileStream = fs.createWriteStream(logPath, { flags: 'a' });
      
      // Reattach error handler
      logFileStream.on('error', (error) => {
        if (originalConsole && originalConsole.error && !isWriting) {
          originalConsole.error('❌ Log stream error:', error.message);
        }
      });
      
    } catch (error) {
      if (originalConsole && originalConsole.error) {
        originalConsole.error('❌ Log file rewrite error:', error.message);
      }
    }
  },

  /**
   * Restore original console
   */
  restore() {
    if (!isActive || !originalConsole) {
      return;
    }

    // Clear memory management interval
    if (memoryInterval) {
      clearInterval(memoryInterval);
      memoryInterval = null;
    }

    // Restore original console methods
    Object.keys(originalConsole).forEach(method => {
      console[method] = originalConsole[method];
    });

    // Close file stream
    if (logFileStream && !logFileStream.destroyed) {
      logFileStream.end();
    }

    // Reset state
    isActive = false;
    originalConsole = null;
    logFileStream = null;
    logLines = [];
    isWriting = false;
  },

  /**
   * Check if override is active
   * @returns {boolean}
   */
  isActive() {
    return isActive;
  },

  /**
   * Get current memory lines count (for testing/debugging)
   * @returns {number}
   */
  getMemoryLinesCount() {
    return logLines.length;
  },

  /**
   * Get current log path
   * @returns {string|null}
   */
  getLogPath() {
    if (!logFileStream) {
      return null;
    }
    return logFileStream.path;
  }
};

// Cleanup on process exit
process.on('exit', () => {
  consoleOverride.restore();
});

process.on('SIGINT', () => {
  consoleOverride.restore();
  process.exit(0);
});

process.on('SIGTERM', () => {
  consoleOverride.restore();
  process.exit(0);
});

module.exports = consoleOverride;
