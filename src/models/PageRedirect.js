const mongoose = require('mongoose');

const pageRedirectSchema = new mongoose.Schema(
  {
    from: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    to: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: Number,
      enum: [301, 302],
      default: 301,
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    note: {
      type: String,
      default: '',
    },
  },
  { timestamps: true, collection: 'page_redirects' },
);

pageRedirectSchema.index({ from: 1, enabled: 1 });

module.exports = mongoose.models.PageRedirect || mongoose.model('PageRedirect', pageRedirectSchema);
