const mongoose = require('mongoose');

const proxyRuleSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },
    type: { type: String, enum: ['contains', 'regexp'], required: true },
    value: { type: String, required: true },
    applyTo: { type: String, enum: ['targetUrl', 'host', 'path'], default: 'targetUrl' },
    flags: { type: String, default: 'i' },
  },
  { _id: false },
);

const proxyEntrySchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    enabled: { type: Boolean, default: false, index: true },
    match: {
      type: {
        type: String,
        enum: ['exact', 'contains', 'regexp'],
        default: 'contains',
      },
      value: { type: String, required: true },
      applyTo: { type: String, enum: ['targetUrl', 'host', 'path'], default: 'host' },
      flags: { type: String, default: 'i' },
    },
    policy: {
      mode: { type: String, enum: ['blacklist', 'whitelist', 'allowAll', 'denyAll'], default: 'whitelist' },
      rules: { type: [proxyRuleSchema], default: [] },
    },
    rateLimit: {
      enabled: { type: Boolean, default: false },
      limiterId: { type: String, default: null },
    },
    cache: {
      enabled: { type: Boolean, default: false },
      ttlSeconds: { type: Number, default: 60 },
      namespace: { type: String, default: 'proxy' },
      methods: { type: [String], default: ['GET', 'HEAD'] },
      keyParts: {
        url: { type: Boolean, default: true },
        query: { type: Boolean, default: true },
        bodyHash: { type: Boolean, default: true },
        headersHash: { type: Boolean, default: true },
      },
      keyHeaderAllowList: { type: [String], default: [] },
    },
    headers: {
      forwardAuthorization: { type: Boolean, default: true },
      forwardCookie: { type: Boolean, default: true },
      allowList: { type: [String], default: [] },
      denyList: { type: [String], default: [] },
    },
    transform: {
      enabled: { type: Boolean, default: false },
      timeoutMs: { type: Number, default: 200 },
      code: { type: String, default: '' },
    },
  },
  { timestamps: true, collection: 'proxy_entries' },
);

proxyEntrySchema.index({ 'match.type': 1, 'match.applyTo': 1 });

module.exports = mongoose.models.ProxyEntry || mongoose.model('ProxyEntry', proxyEntrySchema);
