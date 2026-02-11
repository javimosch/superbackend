const mongoose = require('mongoose');

const telegramBotSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  token: {
    type: String,
    required: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: false
  },
  allowedUserIds: {
    type: [String],
    default: []
  },
  defaultAgentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent'
  },
  orgId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization'
  },
  status: {
    type: String,
    enum: ['stopped', 'running', 'error'],
    default: 'stopped'
  },
  lastError: {
    type: String
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('TelegramBot', telegramBotSchema);
