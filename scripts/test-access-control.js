require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

// Add src directory to require path
process.chdir(path.join(__dirname, '..'));
const rbacService = require('./src/services/rbac.service');

async function testAccessControl() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { authSource: 'admin' });
    console.log('Connected to MongoDB');

    // Find the limited-admin user
    const User = require('./src/models/User');
    const user = await User.findOne({ email: 'limitedadmin@example.com' });
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log(`✅ Found user: ${user.email} (${user.role})`);

    // Test access to audit (should be allowed)
    console.log('\n🔍 Testing audit access...');
    const auditAccess = await rbacService.checkRight({
      userId: user._id,
      orgId: null,
      right: 'admin_panel__audit:read'
    });
    console.log(`Audit access: ${auditAccess.allowed ? '✅ ALLOWED' : '❌ DENIED'}`);
    if (!auditAccess.allowed) {
      console.log(`Reason: ${auditAccess.reason}`);
    }

    // Test access to users (should be denied)
    console.log('\n🔍 Testing users access...');
    const usersAccess = await rbacService.checkRight({
      userId: user._id,
      orgId: null,
      right: 'admin_panel__users:read'
    });
    console.log(`Users access: ${usersAccess.allowed ? '✅ ALLOWED' : '❌ DENIED'}`);
    if (!usersAccess.allowed) {
      console.log(`Reason: ${usersAccess.reason}`);
    }

    // Test access to errors (should be allowed)
    console.log('\n🔍 Testing errors access...');
    const errorsAccess = await rbacService.checkRight({
      userId: user._id,
      orgId: null,
      right: 'admin_panel__errors:read'
    });
    console.log(`Errors access: ${errorsAccess.allowed ? '✅ ALLOWED' : '❌ DENIED'}`);
    if (!errorsAccess.allowed) {
      console.log(`Reason: ${errorsAccess.reason}`);
    }

    // Test access to dashboard (should be allowed)
    console.log('\n🔍 Testing dashboard access...');
    const dashboardAccess = await rbacService.checkRight({
      userId: user._id,
      orgId: null,
      right: 'admin_panel__dashboard'
    });
    console.log(`Dashboard access: ${dashboardAccess.allowed ? '✅ ALLOWED' : '❌ DENIED'}`);
    if (!dashboardAccess.allowed) {
      console.log(`Reason: ${dashboardAccess.reason}`);
    }

    console.log('\n🎉 Access control test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

testAccessControl();
