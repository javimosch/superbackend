const mongoose = require('mongoose');

const blogAutomationLockSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    lockedUntil: { type: Date, required: true },
    ownerId: { type: String, required: true },
  },
  { timestamps: true, collection: 'blog_automation_locks' },
);

module.exports =
  mongoose.models.BlogAutomationLock ||
  mongoose.model('BlogAutomationLock', blogAutomationLockSchema);
