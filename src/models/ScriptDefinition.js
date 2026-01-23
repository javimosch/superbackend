const mongoose = require('mongoose');

const envVarSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    value: { type: String, required: true },
  },
  { _id: false },
);

const scriptDefinitionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    codeIdentifier: { type: String, required: true, unique: true, index: true },
    description: { type: String, default: '' },
    type: { type: String, enum: ['bash', 'node', 'browser'], required: true },
    runner: { type: String, enum: ['host', 'vm2', 'browser'], required: true },
    script: { type: String, required: true },
    defaultWorkingDirectory: { type: String, default: '' },
    env: { type: [envVarSchema], default: [] },
    timeoutMs: { type: Number, default: 5 * 60 * 1000 },
    enabled: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'script_definitions' },
);

function normalizeCodeIdentifier(codeIdentifier) {
  return String(codeIdentifier || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '');
}

scriptDefinitionSchema.pre('validate', function preValidate(next) {
  this.codeIdentifier = normalizeCodeIdentifier(this.codeIdentifier);
  next();
});

module.exports =
  mongoose.models.ScriptDefinition ||
  mongoose.model('ScriptDefinition', scriptDefinitionSchema);
