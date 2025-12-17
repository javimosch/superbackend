const mongoose = require('mongoose');

const organizationMemberSchema = new mongoose.Schema({
  orgId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  role: {
    type: String,
    default: 'member'
  },
  status: {
    type: String,
    enum: ['active', 'removed'],
    default: 'active'
  },
  addedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

organizationMemberSchema.index({ orgId: 1, userId: 1 }, { unique: true });
organizationMemberSchema.index({ userId: 1, status: 1, createdAt: -1 });
organizationMemberSchema.index({ orgId: 1, status: 1, role: 1 });

organizationMemberSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('OrganizationMember', organizationMemberSchema);
