const mongoose = require('mongoose');

const cacheEntrySchema = new mongoose.Schema(
  {
    namespace: { type: String, required: true, index: true },
    key: { type: String, required: true, index: true },

    value: { type: String, required: true },
    atRestFormat: { type: String, enum: ['string', 'base64'], default: 'string', index: true },

    sizeBytes: { type: Number, default: 0 },

    expiresAt: { type: Date, default: null, index: true },

    hits: { type: Number, default: 0 },
    lastAccessAt: { type: Date, default: null },

    source: { type: String, enum: ['offloaded', 'manual'], default: 'manual', index: true },
  },
  { timestamps: true, collection: 'cache_entries' },
);

cacheEntrySchema.index({ namespace: 1, key: 1 }, { unique: true });
cacheEntrySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.CacheEntry || mongoose.model('CacheEntry', cacheEntrySchema);
