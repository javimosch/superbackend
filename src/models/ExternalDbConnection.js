const mongoose = require('mongoose');

const externalDbConnectionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['mongo', 'mysql'],
      index: true,
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Non-secret (safe to return)
    uriMasked: {
      type: String,
      default: null,
    },

    // Encrypted at rest (NEVER return decrypted)
    uriEncrypted: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

externalDbConnectionSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.uriEncrypted;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('ExternalDbConnection', externalDbConnectionSchema);
