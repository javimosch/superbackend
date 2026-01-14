// Quick test script for middleware mode
const express = require('express');
const { middleware } = require('./index');

const app = express();

console.log('🧪 Testing middleware mode...\n');

// Simple parent app route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Parent Application',
    superBackend: 'Mounted at /saas'
  });
});

// Mount SuperBackend middleware
app.use('/saas', middleware({
  mongodbUri: process.env.MONGODB_URI,
  corsOrigin: '*'
}));

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`\n✅ Test server running on http://localhost:${PORT}`);
  console.log(`📦 Parent app: http://localhost:${PORT}/`);
  console.log(`📦 SuperBackend health: http://localhost:${PORT}/saas/health`);
  console.log(`📦 SuperBackend admin: http://localhost:${PORT}/saas/admin/test`);
  console.log('\n⏸️  Server will keep running. Press Ctrl+C to stop.');
});
