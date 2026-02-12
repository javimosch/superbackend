const { mongooseHelper } = require('./mongooseHelper');

/**
 * Base class for scripts with database connectivity
 * Provides automatic connection management and error handling
 */
class ScriptBase {
  constructor(options = {}) {
    this.name = options.name || this.constructor.name;
    this.autoDisconnect = options.autoDisconnect !== false;
    this.timeout = options.timeout || 300000; // 5 minutes default
    this.startTime = null;
    this.context = null;
  }

  /**
   * Main script execution method (to be implemented by subclasses)
   * @param {Object} context - Execution context with mongoose instance
   * @returns {Promise<any>} Script result
   */
  async execute(context) {
    throw new Error('execute method must be implemented by subclass');
  }

  /**
   * Setup method called before execution (optional override)
   * @param {Object} context - Execution context
   * @returns {Promise<void>}
   */
  async setup(context) {
    // Override in subclasses if needed
  }

  /**
   * Cleanup method called after execution (optional override)
   * @param {Object} context - Execution context
   * @returns {Promise<void>}
   */
  async cleanup(context) {
    // Override in subclasses if needed
  }

  /**
   * Run the script with automatic database connection management
   * @returns {Promise<any>} Script result
   */
  async run() {
    this.startTime = Date.now();
    
    // Set up timeout handling
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Script ${this.name} timed out after ${this.timeout}ms`));
      }, this.timeout);
    });

    try {
      if (!process.env.TUI_MODE) console.log(`[${this.name}] Starting script execution...`);
      
      const executionPromise = this._executeWithConnection();
      const result = await Promise.race([executionPromise, timeoutPromise]);

      const duration = Date.now() - this.startTime;
      if (!process.env.TUI_MODE) console.log(`[${this.name}] ✅ Completed in ${duration}ms`);
      
      return result;
    } catch (error) {
      const duration = Date.now() - this.startTime;
      console.error(`[${this.name}] ❌ Failed after ${duration}ms:`, error.message);
      
      // Ensure cleanup on error
      await this._handleError(error);
      throw error;
    }
  }

  /**
   * Internal execution method with connection management
   * @private
   * @returns {Promise<any>}
   */
  async _executeWithConnection() {
    return await mongooseHelper.withConnection(
      async (mongoose) => {
        // Create execution context
        this.context = {
          mongoose,
          models: mongoose.models,
          connection: mongoose.connection,
          db: mongoose.connection.db,
          script: {
            name: this.name,
            startTime: this.startTime,
            timeout: this.timeout
          }
        };

        // Call setup
        await this.setup(this.context);

        try {
          // Execute main logic
          const result = await this.execute(this.context);
          return result;
        } finally {
          // Call cleanup
          await this.cleanup(this.context);
        }
      },
      { autoDisconnect: this.autoDisconnect }
    );
  }

  /**
   * Handle script errors and cleanup
   * @private
   * @param {Error} error - The error that occurred
   */
  async _handleError(error) {
    try {
      // Call cleanup with error context if available
      if (this.context) {
        await this.cleanup(this.context);
      }
    } catch (cleanupError) {
      console.error(`[${this.name}] Cleanup error:`, cleanupError.message);
    }

    // Force disconnect on error
    await mongooseHelper.forceDisconnect();
  }

  /**
   * Get script execution status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      name: this.name,
      isRunning: this.startTime !== null,
      startTime: this.startTime,
      duration: this.startTime ? Date.now() - this.startTime : null,
      timeout: this.timeout,
      autoDisconnect: this.autoDisconnect,
      connectionStatus: mongooseHelper.getStatus()
    };
  }

  /**
   * Validate script configuration
   * @returns {Object} Validation result
   */
  validate() {
    const errors = [];
    const warnings = [];

    // Check if execute method is implemented
    if (this.execute === ScriptBase.prototype.execute) {
      errors.push('execute method must be implemented');
    }

    // Check timeout value
    if (this.timeout <= 0) {
      errors.push('timeout must be greater than 0');
    }

    if (this.timeout > 3600000) { // 1 hour
      warnings.push('timeout is very long (> 1 hour)');
    }

    // Check environment
    if (!process.env.MONGODB_URI && !process.env.MONGO_URI) {
      warnings.push('No MongoDB URI environment variable set, will use localhost');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Create a child script with inherited configuration
   * @param {Function} ChildScriptClass - Child script class
   * @param {Object} options - Additional options for child
   * @returns {ScriptBase} Child script instance
   */
  createChild(ChildScriptClass, options = {}) {
    const childOptions = {
      timeout: this.timeout,
      autoDisconnect: this.autoDisconnect,
      ...options
    };

    return new ChildScriptClass(childOptions);
  }

  /**
   * Log script message with consistent formatting
   * @param {string} level - Log level (info, warn, error, debug)
   * @param {string} message - Message to log
   * @param {any} data - Additional data to log
   */
  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}][${this.name}]`;
    
    switch (level) {
      case 'info':
        console.log(`${prefix} ${message}`, data || '');
        break;
      case 'warn':
        console.warn(`${prefix} ⚠️  ${message}`, data || '');
        break;
      case 'error':
        console.error(`${prefix} ❌ ${message}`, data || '');
        break;
      case 'debug':
        if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
          console.debug(`${prefix} 🔍 ${message}`, data || '');
        }
        break;
      default:
        console.log(`${prefix} ${message}`, data || '');
    }
  }
}

module.exports = { ScriptBase };
