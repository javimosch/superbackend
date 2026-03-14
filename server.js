require('dotenv').config({ path: process.env.ENV_FILE || '.env' });
const { server } = require('./index');

// Start the standalone server
server();