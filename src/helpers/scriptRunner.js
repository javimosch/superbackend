const { ScriptBase } = require('./scriptBase');

/**
 * Utility for running scripts with proper error handling and cleanup
 * Provides CLI wrapper functionality and execution management
 */
class ScriptRunner {
  /**
   * Run a script class or function
   * @param {Function|ScriptBase} ScriptClass - Script class or function
   * @param {Object} options - Execution options
   * @returns {Promise<any>} Script result
   */
  static async run(ScriptClass, options = {}) {
    let script;
    
    try {
      // Handle different script types
      script = ScriptRunner._createScriptInstance(ScriptClass, options);
      
      // Validate script before running
      const validation = script.validate();
      if (!validation.valid) {
        throw new Error(`Script validation failed: ${validation.errors.join(', ')}`);
      }
      
      // Log warnings if any
      if (validation.warnings.length > 0) {
        validation.warnings.forEach(warning => {
          console.warn(`[ScriptRunner] Warning: ${warning}`);
        });
      }

      return await script.run();
    } catch (error) {
      console.error('[ScriptRunner] Execution failed:', error.message);
      
      if (script) {
        await script.cleanup(script.context);
      }
      
      throw error;
    }
  }

  /**
   * Create script instance from various input types
   * @private
   * @param {Function|ScriptBase} ScriptClass - Script class or function
   * @param {Object} options - Options for script creation
   * @returns {ScriptBase} Script instance
   */
  static _createScriptInstance(ScriptClass, options = {}) {
    // Handle plain async functions
    if (typeof ScriptClass === 'function' && !ScriptBase.prototype.isPrototypeOf(ScriptClass.prototype)) {
      // Wrap the function in a ScriptBase class
      const WrappedScript = class extends ScriptBase {
        async execute(context) {
          return await ScriptClass(context, options);
        }
      };
      
      return new WrappedScript(options);
    }
    
    // Handle ScriptBase classes
    if (typeof ScriptClass === 'function' && ScriptBase.prototype.isPrototypeOf(ScriptClass.prototype)) {
      return new ScriptClass(options);
    }
    
    // Handle ScriptBase instances
    if (ScriptBase.prototype.isPrototypeOf(ScriptClass)) {
      return ScriptClass;
    }
    
    throw new Error('Invalid script type: must be a function, ScriptBase class, or ScriptBase instance');
  }

  /**
   * Create a CLI wrapper for scripts
   * @param {Function|ScriptBase} ScriptClass - Script class or function
   * @param {Object} defaultOptions - Default options
   * @returns {Function} CLI-ready function
   */
  static createCli(ScriptClass, defaultOptions = {}) {
    return async (options = {}) => {
      const mergedOptions = { ...defaultOptions, ...options };
      
      // Handle CLI execution
      if (require.main === module) {
        try {
          // Parse command line arguments if provided
          const cliOptions = ScriptRunner._parseCliArgs();
          const finalOptions = { ...mergedOptions, ...cliOptions };
          
          await ScriptRunner.run(ScriptClass, finalOptions);
          console.log('✅ Script completed successfully');
          process.exit(0);
        } catch (error) {
          console.error('❌ Script failed:', error.message);
          
          // Show stack trace in debug mode
          if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
            console.error(error.stack);
          }
          
          process.exit(1);
        }
      } else {
        // Return result when required as module
        return await ScriptRunner.run(ScriptClass, mergedOptions);
      }
    };
  }

  /**
   * Parse command line arguments
   * @private
   * @returns {Object} Parsed arguments
   */
  static _parseCliArgs() {
    const args = process.argv.slice(2);
    const options = {};
    
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      // Handle --key=value or --key value format
      if (arg.startsWith('--')) {
        const equalsIndex = arg.indexOf('=');
        
        if (equalsIndex > 0) {
          // --key=value format
          const key = arg.substring(2, equalsIndex);
          const value = arg.substring(equalsIndex + 1);
          options[key] = ScriptRunner._parseValue(value);
        } else {
          // --key value format
          const key = arg.substring(2);
          
          if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
            const value = args[i + 1];
            options[key] = ScriptRunner._parseValue(value);
            i++; // Skip next argument as it's a value
          } else {
            // Boolean flag
            options[key] = true;
          }
        }
      }
    }
    
    return options;
  }

  /**
   * Parse string value to appropriate type
   * @private
   * @param {string} value - String value to parse
   * @returns {any} Parsed value
   */
  static _parseValue(value) {
    // Try parsing as JSON
    try {
      return JSON.parse(value);
    } catch {
      // Fallback to string
      return value;
    }
  }

  /**
   * Create a batch script runner for multiple scripts
   * @param {Array} scripts - Array of script configurations
   * @param {Object} options - Batch options
   * @returns {Function} Batch runner function
   */
  static createBatch(scripts, options = {}) {
    const { 
      stopOnError = true, 
      parallel = false, 
      maxConcurrency = 3 
    } = options;

    return async (runOptions = {}) => {
      const results = [];
      const errors = [];
      
      console.log(`[BatchRunner] Running ${scripts.length} scripts (${parallel ? 'parallel' : 'sequential'})`);
      
      if (parallel) {
        // Run scripts in parallel with concurrency limit
        const chunks = ScriptRunner._chunkArray(scripts, maxConcurrency);
        
        for (const chunk of chunks) {
          const chunkPromises = chunk.map(async (scriptConfig, index) => {
            try {
              const { script, options: scriptOptions } = scriptConfig;
              const result = await ScriptRunner.run(script, { ...runOptions, ...scriptOptions });
              return { index, result, error: null };
            } catch (error) {
              return { index, result: null, error };
            }
          });
          
          const chunkResults = await Promise.all(chunkPromises);
          
          for (const { index, result, error } of chunkResults) {
            if (error) {
              errors.push({ index, error });
              if (stopOnError) {
                throw error;
              }
            } else {
              results[index] = result;
            }
          }
        }
      } else {
        // Run scripts sequentially
        for (let i = 0; i < scripts.length; i++) {
          const { script, options: scriptOptions } = scripts[i];
          
          try {
            console.log(`[BatchRunner] Running script ${i + 1}/${scripts.length}`);
            const result = await ScriptRunner.run(script, { ...runOptions, ...scriptOptions });
            results.push(result);
          } catch (error) {
            errors.push({ index: i, error });
            if (stopOnError) {
              throw error;
            }
          }
        }
      }
      
      return { results, errors };
    };
  }

  /**
   * Split array into chunks
   * @private
   * @param {Array} array - Array to split
   * @param {number} size - Chunk size
   * @returns {Array} Array of chunks
   */
  static _chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Create a scheduled script runner
   * @param {Function|ScriptBase} ScriptClass - Script to run
   * @param {Object} schedule - Schedule configuration
   * @returns {Object} Scheduled runner
   */
  static createScheduled(ScriptClass, schedule = {}) {
    const { 
      interval, 
      cron, 
      maxRuns = null, 
      runOnStart = false 
    } = schedule;

    let runCount = 0;
    let timer = null;

    const scheduledRunner = {
      isRunning: false,
      start() {
        if (this.isRunning) {
          throw new Error('Scheduled runner is already running');
        }

        this.isRunning = true;
        
        if (runOnStart) {
          this.runScript();
        }

        if (interval) {
          timer = setInterval(() => this.runScript(), interval);
        } else if (cron) {
          // Note: Would need a cron library implementation
          throw new Error('Cron scheduling not implemented yet');
        } else {
          throw new Error('Must specify either interval or cron schedule');
        }
      },

      stop() {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
        this.isRunning = false;
      },

      async runScript() {
        if (maxRuns && runCount >= maxRuns) {
          console.log('[ScheduledRunner] Maximum runs reached, stopping');
          this.stop();
          return;
        }

        try {
          runCount++;
          console.log(`[ScheduledRunner] Run #${runCount}`);
          await ScriptRunner.run(ScriptClass);
        } catch (error) {
          console.error('[ScheduledRunner] Scheduled run failed:', error);
        }
      },

      getStatus() {
        return {
          isRunning: this.isRunning,
          runCount,
          maxRuns,
          interval,
          cron
        };
      }
    };

    return scheduledRunner;
  }
}

module.exports = { ScriptRunner };
