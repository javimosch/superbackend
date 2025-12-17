const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  provider: {
    type: String,
    required: true,
    enum: ['s3', 'fs'],
    default: 'fs'
  },
  bucket: {
    type: String,
    required: true,
    default: 'fs'
  },
  originalName: {
    type: String,
    required: true
  },
  contentType: {
    type: String,
    required: true
  },
  sizeBytes: {
    type: Number,
    required: true
  },
  visibility: {
    type: String,
    required: true,
    enum: ['public', 'private'],
    default: 'private'
  },
  ownerUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    default: null
  },
  orgId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true,
    default: null
  },
  status: {
    type: String,
    required: true,
    enum: ['uploaded', 'deleted'],
    default: 'uploaded'
  }
}, {
  timestamps: true
});

assetSchema.index({ ownerUserId: 1, createdAt: -1 });
assetSchema.index({ visibility: 1, status: 1 });
assetSchema.index({ orgId: 1, createdAt: -1 });

module.exports = mongoose.model('Asset', assetSchema);
