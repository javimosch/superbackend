const mongoose = require('mongoose');

const auditEventSchema = new mongoose.Schema(
  {
    actorType: {
      type: String,
      required: true,
      enum: ['admin', 'admin_basic', 'user', 'system', 'anonymous'],
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    actorRole: {
      type: String,
      default: null,
    },
    actorId: {
      type: String,
      default: null,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    entityType: {
      type: String,
      required: false,
      index: true,
    },
    entityId: {
      type: String,
      required: false,
      default: null,
      index: true,
    },
    before: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    after: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    outcome: {
      type: String,
      enum: ['success', 'failure'],
      default: 'success',
      index: true,
    },
    context: {
      ip: String,
      userAgent: String,
      requestId: String,
      path: String,
      method: String,
    },
    targetType: {
      type: String,
      default: null,
      index: true,
    },
    targetId: {
      type: String,
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

auditEventSchema.index({ action: 1, createdAt: -1 });
auditEventSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditEventSchema.index({ outcome: 1, createdAt: -1 });
auditEventSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

auditEventSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('AuditEvent', auditEventSchema);
