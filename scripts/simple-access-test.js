require('dotenv').config();
const mongoose = require('mongoose');

async function testAccessControl() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { authSource: 'admin' });
    console.log('✅ Connected to MongoDB');

    // Check if roles and grants exist
    const RbacRole = require('./src/models/RbacRole');
    const RbacGrant = require('./src/models/RbacGrant');
    const User = require('./src/models/User');

    // Find the limited-admin user
    const user = await User.findOne({ email: 'limitedadmin@example.com' });
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log(`✅ Found user: ${user.email} (${user.role})`);

    // Find the limited-admin role
    const limitedAdminRole = await RbacRole.findOne({ key: 'limited-admin' });
    if (!limitedAdminRole) {
      console.log('❌ limited-admin role not found');
      return;
    }
    
    console.log(`✅ Found role: ${limitedAdminRole.name}`);

    // Check grants for the role
    const grants = await RbacGrant.find({ 
      subjectType: 'role',
      subjectId: limitedAdminRole._id 
    });
    
    console.log(`\n📋 Role grants (${grants.length}):`);
    grants.forEach(grant => {
      console.log(`  - ${grant.right}`);
    });

    // Check specific permissions
    const auditGrant = grants.find(g => g.right === 'admin_panel__audit:read');
    const usersGrant = grants.find(g => g.right === 'admin_panel__users:read');
    const errorsGrant = grants.find(g => g.right === 'admin_panel__errors:read');

    console.log('\n🔍 Permission Summary:');
    console.log(`Audit access: ${auditGrant ? '✅ ALLOWED' : '❌ DENIED'}`);
    console.log(`Users access: ${usersGrant ? '✅ ALLOWED' : '❌ DENIED'}`);
    console.log(`Errors access: ${errorsGrant ? '✅ ALLOWED' : '❌ DENIED'}`);

    console.log('\n🎉 Access control test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

testAccessControl();
