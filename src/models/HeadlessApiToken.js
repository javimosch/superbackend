const mongoose = require('mongoose');

const tokenPermissionSchema = new mongoose.Schema(
  {
    modelCode: { type: String, required: true },
    operations: { type: [String], default: [] },
  },
  { _id: false },
);

const headlessApiTokenSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    permissions: { type: [tokenPermissionSchema], default: [] },
    expiresAt: { type: Date, default: null, index: true },
    isActive: { type: Boolean, default: true, index: true },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'headless_api_tokens' },
);

module.exports = mongoose.models.HeadlessApiToken ||
  mongoose.model('HeadlessApiToken', headlessApiTokenSchema);
