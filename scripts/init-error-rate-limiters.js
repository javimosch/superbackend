require('dotenv').config();
const mongoose = require('mongoose');
const { createJsonConfig, getJsonConfig } = require('../src/services/jsonConfigs.service');
const JsonConfig = require('../src/models/JsonConfig');

async function initializeErrorReportingRateLimiters() {
  try {
    console.log('Connecting to database...');
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/myappdb';
    await mongoose.connect(mongoUri);
    console.log('✅ Database connected');

    console.log('Initializing error reporting rate limiters...');

    // Check if rate-limits config already exists
    let existingConfig;
    let configId;
    try {
      existingConfig = await getJsonConfig('rate-limits');
      console.log('Existing rate-limits config found');
      
      // Get the full config document to get the ID
      const configDoc = await JsonConfig.findOne({ 
        $or: [
          { slug: 'rate-limits' },
          { alias: 'rate-limits' }
        ]
      });
      
      if (configDoc) {
        configId = configDoc._id;
        console.log('Config ID:', configId);
      } else {
        throw new Error('Config document not found');
      }
    } catch (error) {
      if (error.code === 'NOT_FOUND' || error.message === 'Config document not found') {
        console.log('No existing rate-limits config found, creating new one...');
        existingConfig = null;
      } else {
        throw error;
      }
    }

    const defaultConfig = {
      version: 1,
      defaults: {
        enabled: false,
        mode: 'enforce',
        algorithm: 'fixedWindow',
        limit: { max: 60, windowMs: 60000 },
        identity: { type: 'userIdOrIp' },
        metrics: { enabled: true, bucketMs: 60000, retentionDays: 14 },
        store: { ttlBufferMs: 60000, failOpen: true }
      },
      limiters: {
        errorReportingAuthLimiter: {
          enabled: true,
          mode: 'enforce',
          algorithm: 'fixedWindow',
          limit: { max: 30, windowMs: 60000 },
          identity: { type: 'userId' },
          metrics: { enabled: true, bucketMs: 60000, retentionDays: 14 },
          store: { ttlBufferMs: 60000, failOpen: true }
        },
        errorReportingAnonLimiter: {
          enabled: true,
          mode: 'enforce',
          algorithm: 'fixedWindow',
          limit: { max: 10, windowMs: 60000 },
          identity: { type: 'ip' },
          metrics: { enabled: true, bucketMs: 60000, retentionDays: 14 },
          store: { ttlBufferMs: 60000, failOpen: true }
        }
      }
    };

    if (existingConfig) {
      // Merge with existing config, adding our new limiters if they don't exist
      const mergedConfig = { ...existingConfig };
      
      // Add our limiters if they don't exist
      if (!mergedConfig.limiters) {
        mergedConfig.limiters = {};
      }
      
      mergedConfig.limiters.errorReportingAuthLimiter = defaultConfig.limiters.errorReportingAuthLimiter;
      mergedConfig.limiters.errorReportingAnonLimiter = defaultConfig.limiters.errorReportingAnonLimiter;
      
      console.log('Updating existing rate-limits config...');
      await require('../src/services/jsonConfigs.service').updateJsonConfig(configId, mergedConfig);
      console.log('Rate limiters added to existing config');
    } else {
      // Create new config
      console.log('Creating new rate-limits config...');
      await createJsonConfig({
        title: 'Rate Limits Configuration',
        alias: 'rate-limits',
        publicEnabled: false, // Rate limits should not be public
        cacheTtlSeconds: 300, // 5 minutes cache
        data: defaultConfig
      });
      console.log('Rate limits config created successfully');
    }

    console.log('✅ Error reporting rate limiters initialized successfully');
    console.log('- errorReportingAuthLimiter: 30 requests/minute for authenticated users');
    console.log('- errorReportingAnonLimiter: 10 requests/minute for anonymous users');
    
    // Close database connection
    await mongoose.disconnect();
    console.log('✅ Database connection closed');
    
  } catch (error) {
    console.error('❌ Failed to initialize error reporting rate limiters:', error);
    
    // Ensure database connection is closed on error
    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      console.error('Failed to close database connection:', disconnectError);
    }
    
    process.exit(1);
  }
}

// Run the initialization
if (require.main === module) {
  initializeErrorReportingRateLimiters()
    .then(() => {
      console.log('Initialization completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Initialization failed:', error);
      process.exit(1);
    });
}

module.exports = { initializeErrorReportingRateLimiters };
