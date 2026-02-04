const mongoose = require('mongoose');

/**
 * Mongoose connection state management
 * Provides centralized connection handling with reference counting and automatic cleanup
 */
class MongooseHelper {
  constructor() {
    this.connectionPromise = null;
    this.isConnected = false;
    this.connectionCount = 0;
    this.connectionOptions = null;
  }

  /**
   * Get MongoDB URI from environment with fallbacks
   * @returns {string} MongoDB connection URI
   */
  getMongoUri() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/myappdb';
    if (!uri) {
      throw new Error('Missing MONGODB_URI or MONGO_URI environment variable');
    }
    return uri;
  }

  /**
   * Get mongoose connection options
   * @returns {Object} Connection options
   */
  getConnectionOptions() {
    if (this.connectionOptions) {
      return this.connectionOptions;
    }

    this.connectionOptions = {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 2, // Conservative for scripts
      bufferCommands: false,
      // Add retry settings for reliability
      retryWrites: true,
      retryReads: true,
      // Add socket settings for scripts
      socketTimeoutMS: 30000,
      connectTimeoutMS: 10000,
    };

    return this.connectionOptions;
  }

  /**
   * Connect to MongoDB (singleton pattern)
   * @returns {Promise<mongoose.Connection>} Mongoose connection
   */
  async connect() {
    // Return existing connection if already connected
    if (this.isConnected && mongoose.connection.readyState === 1) {
      this.connectionCount++;
      return mongoose.connection;
    }

    // Return existing promise if connection is in progress
    if (this.connectionPromise) {
      await this.connectionPromise;
      this.connectionCount++;
      return mongoose.connection;
    }

    // Create new connection promise
    this.connectionPromise = this._createConnection();
    await this.connectionPromise;
    this.connectionCount++;
    return mongoose.connection;
  }

  /**
   * Internal connection creation
   * @private
   * @returns {Promise<mongoose.Connection>}
   */
  async _createConnection() {
    try {
      const uri = this.getMongoUri();
      const options = this.getConnectionOptions();
      
      console.log(`[MongooseHelper] Connecting to MongoDB...`);
      
      // Clear any existing connection
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      
      await mongoose.connect(uri, options);
      
      this.isConnected = true;
      
      console.log(`[MongooseHelper] ✅ Connected to MongoDB`);
      
      // Setup connection error handling
      mongoose.connection.on('error', (error) => {
        console.error('[MongooseHelper] Connection error:', error);
        this.isConnected = false;
        this.connectionPromise = null;
      });

      mongoose.connection.on('disconnected', () => {
        console.log('[MongooseHelper] Disconnected from MongoDB');
        this.isConnected = false;
        this.connectionPromise = null;
      });

      mongoose.connection.on('reconnected', () => {
        console.log('[MongooseHelper] Reconnected to MongoDB');
        this.isConnected = true;
      });

      return mongoose.connection;
    } catch (error) {
      this.connectionPromise = null;
      throw error;
    }
  }

  /**
   * Disconnect from MongoDB (reference counting)
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (!this.isConnected) {
      return;
    }

    this.connectionCount--;
    
    // Only disconnect if no more references
    if (this.connectionCount <= 0) {
      try {
        await mongoose.disconnect();
        console.log('[MongooseHelper] ✅ Disconnected from MongoDB');
      } catch (error) {
        console.error('[MongooseHelper] Disconnect error:', error);
      } finally {
        this.isConnected = false;
        this.connectionPromise = null;
        this.connectionCount = 0;
      }
    }
  }

  /**
   * Force disconnect regardless of reference count
   * @returns {Promise<void>}
   */
  async forceDisconnect() {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
        console.log('[MongooseHelper] ✅ Force disconnected from MongoDB');
      }
    } catch (error) {
      console.error('[MongooseHelper] Force disconnect error:', error);
    } finally {
      this.isConnected = false;
      this.connectionPromise = null;
      this.connectionCount = 0;
    }
  }

  /**
   * Get connection status
   * @returns {Object} Connection status info
   */
  getStatus() {
    const readyStateMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      readyStateText: readyStateMap[mongoose.connection.readyState] || 'unknown',
      connectionCount: this.connectionCount,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
      hasActiveConnection: mongoose.connection.readyState === 1
    };
  }

  /**
   * Execute function with automatic connection management
   * @param {Function} fn - Async function to execute
   * @param {Object} options - Options
   * @returns {Promise<any>} Function result
   */
  async withConnection(fn, options = {}) {
    await this.connect();
    
    try {
      const result = await fn(mongoose);
      return result;
    } finally {
      if (options.autoDisconnect !== false) {
        await this.disconnect();
      }
    }
  }

  /**
   * Wait for connection to be ready
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<void>}
   */
  async waitForConnection(timeout = 10000) {
    const startTime = Date.now();
    
    while (mongoose.connection.readyState !== 1) {
      if (Date.now() - startTime > timeout) {
        throw new Error(`Connection timeout after ${timeout}ms`);
      }
      
      if (mongoose.connection.readyState === 0) {
        throw new Error('Connection is disconnected');
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Reset the helper state (useful for testing)
   */
  reset() {
    this.connectionPromise = null;
    this.isConnected = false;
    this.connectionCount = 0;
    this.connectionOptions = null;
  }
}

// Singleton instance
const mongooseHelper = new MongooseHelper();

module.exports = {
  MongooseHelper,
  mongooseHelper,
  connect: () => mongooseHelper.connect(),
  disconnect: () => mongooseHelper.disconnect(),
  forceDisconnect: () => mongooseHelper.forceDisconnect(),
  withConnection: (fn, options) => mongooseHelper.withConnection(fn, options),
  getStatus: () => mongooseHelper.getStatus(),
  getMongoUri: () => mongooseHelper.getMongoUri(),
  waitForConnection: (timeout) => mongooseHelper.waitForConnection(timeout),
  reset: () => mongooseHelper.reset()
};
