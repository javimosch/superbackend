const mongoose = require('mongoose');

const globalSettingSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },
  value: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['string', 'html', 'boolean', 'json', 'number', 'encrypted'],
    default: 'string'
  },
  description: {
    type: String,
    required: true
  },
  templateVariables: {
    type: [String],
    default: []
  },
  public: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// globalSettingSchema.index({ key: 1 }); // Removed duplicate index

module.exports = mongoose.model('GlobalSetting', globalSettingSchema);
