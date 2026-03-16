require('dotenv').config();
const mongoose = require('mongoose');
const { createJsonConfig } = require('../src/services/jsonConfigs.service');

async function initWaitingListPublicExportRateLimiter() {
  console.log('Initializing waiting list public export rate limiter...');

  // Connect to MongoDB
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MongoDB URI not found in environment variables');
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    throw error;
  }

  try {
    // Create rate limiter for public exports
    await createJsonConfig({
      title: 'Waiting List Public Export Limiter',
      alias: 'waitingListPublicExportLimiter',
      jsonRaw: JSON.stringify({
        enabled: true,
        mode: 'enforce',
        algorithm: 'fixedWindow',
        limit: { max: 10, windowMs: 60000 }, // 10 requests per minute
        identity: { type: 'ip' },
        metrics: { enabled: true, bucketMs: 60000, retentionDays: 14 },
        store: { ttlBufferMs: 60000, failOpen: true }
      }),
      publicEnabled: false,
      cacheTtlSeconds: 0 // No caching - required for real-time rate limiting
    });

    console.log('✅ Waiting list public export rate limiter initialized successfully');
  } catch (error) {
    if (error.code === 'DUPLICATE_KEY') {
      console.log('ℹ️  Waiting list public export rate limiter already exists');
    } else {
      console.error('❌ Failed to initialize waiting list public export rate limiter:', error);
      throw error;
    }
  } finally {
    // Close MongoDB connection
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  initWaitingListPublicExportRateLimiter()
    .then(() => {
      console.log('🎉 Rate limiter initialization completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Rate limiter initialization failed:', error);
      process.exit(1);
    });
}

module.exports = { initWaitingListPublicExportRateLimiter };
