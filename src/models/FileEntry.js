const mongoose = require('mongoose');

const fileEntrySchema = new mongoose.Schema(
  {
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    driveType: { type: String, enum: ['user', 'group', 'org'], required: true, index: true },
    driveId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    parentPath: { type: String, required: true, default: '/', index: true },
    name: { type: String, required: true },
    assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
    visibility: { type: String, enum: ['public', 'private'], required: true, default: 'private', index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, collection: 'file_entries' },
);

fileEntrySchema.index(
  { orgId: 1, driveType: 1, driveId: 1, parentPath: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

module.exports = mongoose.models.FileEntry || mongoose.model('FileEntry', fileEntrySchema);
