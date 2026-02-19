#!/usr/bin/env node

/**
 * Bootstrap RBAC Admin System
 * 
 * This script creates the initial RBAC roles and grants needed for admin panel access.
 * It should be run once to set up the basic RBAC structure for the IAM integration.
 */

const mongoose = require('mongoose');
const RbacRole = require('../src/models/RbacRole');
const RbacGrant = require('../src/models/RbacGrant');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/notesyncer';

async function connectToDatabase() {
  try {
    await mongoose.connect(MONGODB_URI, {
      authSource: 'admin'
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

async function createAdminRole() {
  try {
    console.log('Creating admin role...');
    
    // Check if admin role already exists
    const existingRole = await RbacRole.findOne({ key: 'admin' });
    console.log('Existing role check result:', existingRole);
    
    if (existingRole) {
      console.log('ℹ️  Admin role already exists, skipping creation');
      return existingRole;
    }

    // Create admin role
    const adminRole = new RbacRole({
      key: 'admin',
      name: 'Admin',
      description: 'Admin Panel Access - Full administrative privileges',
      status: 'active',
      isGlobal: true
    });

    console.log('Saving admin role...');
    const savedRole = await adminRole.save();
    console.log('✅ Created admin role:', savedRole);
    return savedRole;
  } catch (error) {
    console.error('❌ Failed to create admin role:', error);
    throw error;
  }
}

async function createAdminGrants(adminRole) {
  try {
    // Define admin panel grants
    const adminGrants = [
      {
        subjectType: 'role',
        subjectId: adminRole._id,
        scopeType: 'global',
        right: 'admin_panel__login',
        effect: 'allow'
      },
      {
        subjectType: 'role',
        subjectId: adminRole._id,
        scopeType: 'global',
        right: 'admin_panel__dashboard',
        effect: 'allow'
      },
      {
        subjectType: 'role',
        subjectId: adminRole._id,
        scopeType: 'global',
        right: 'admin_panel__users:read',
        effect: 'allow'
      },
      {
        subjectType: 'role',
        subjectId: adminRole._id,
        scopeType: 'global',
        right: 'admin_panel__users:write',
        effect: 'allow'
      },
      {
        subjectType: 'role',
        subjectId: adminRole._id,
        scopeType: 'global',
        right: 'admin_panel__rbac:read',
        effect: 'allow'
      },
      {
        subjectType: 'role',
        subjectId: adminRole._id,
        scopeType: 'global',
        right: 'admin_panel__rbac:write',
        effect: 'allow'
      },
      {
        subjectType: 'role',
        subjectId: adminRole._id,
        scopeType: 'global',
        right: 'admin_panel__organizations:read',
        effect: 'allow'
      },
      {
        subjectType: 'role',
        subjectId: adminRole._id,
        scopeType: 'global',
        right: 'admin_panel__organizations:write',
        effect: 'allow'
      },
      {
        subjectType: 'role',
        subjectId: adminRole._id,
        scopeType: 'global',
        right: 'admin_panel__notifications:read',
        effect: 'allow'
      },
      {
        subjectType: 'role',
        subjectId: adminRole._id,
        scopeType: 'global',
        right: 'admin_panel__notifications:write',
        effect: 'allow'
      }
    ];

    console.log(`📋 Creating ${adminGrants.length} admin grants...`);

    for (const grantData of adminGrants) {
      // Check if grant already exists
      const existingGrant = await RbacGrant.findOne({
        subjectType: grantData.subjectType,
        subjectId: grantData.subjectId,
        scopeType: grantData.scopeType,
        right: grantData.right
      });

      if (existingGrant) {
        console.log(`ℹ️  Grant '${grantData.right}' already exists, skipping`);
        continue;
      }

      const grant = new RbacGrant(grantData);
      await grant.save();
      console.log(`✅ Created grant: ${grantData.right}`);
    }

    console.log('✅ All admin grants created successfully');
  } catch (error) {
    console.error('❌ Failed to create admin grants:', error);
    throw error;
  }
}

async function createSuperAdminRole() {
  try {
    // Check if superadmin role already exists
    const existingRole = await RbacRole.findOne({ key: 'superadmin' });
    if (existingRole) {
      console.log('ℹ️  Superadmin role already exists, skipping creation');
      return existingRole;
    }

    // Create superadmin role
    const superAdminRole = new RbacRole({
      key: 'superadmin',
      name: 'Super Admin',
      description: 'Super Admin - Full system access including all administrative functions',
      status: 'active',
      isGlobal: true
    });

    const savedRole = await superAdminRole.save();
    console.log('✅ Created superadmin role:', savedRole);
    return savedRole;
  } catch (error) {
    console.error('❌ Failed to create superadmin role:', error);
    throw error;
  }
}

async function createSuperAdminGrants(superAdminRole) {
  try {
    // Define superadmin grants (includes all admin grants plus additional system-level grants)
    const superAdminGrants = [
      // All admin panel grants
      {
        subjectType: 'role',
        subjectId: superAdminRole._id,
        scopeType: 'global',
        right: 'admin_panel__login',
        effect: 'allow'
      },
      {
        subjectType: 'role',
        subjectId: superAdminRole._id,
        scopeType: 'global',
        right: 'admin_panel__dashboard',
        effect: 'allow'
      },
      {
        subjectType: 'role',
        subjectId: superAdminRole._id,
        scopeType: 'global',
        right: 'admin_panel__users:read',
        effect: 'allow'
      },
      {
        subjectType: 'role',
        subjectId: superAdminRole._id,
        scopeType: 'global',
        right: 'admin_panel__users:write',
        effect: 'allow'
      },
      {
        subjectType: 'role',
        subjectId: superAdminRole._id,
        scopeType: 'global',
        right: 'admin_panel__rbac:read',
        effect: 'allow'
      },
      {
        subjectType: 'role',
        subjectId: superAdminRole._id,
        scopeType: 'global',
        right: 'admin_panel__rbac:write',
        effect: 'allow'
      },
      {
        subjectType: 'role',
        subjectId: superAdminRole._id,
        scopeType: 'global',
        right: 'admin_panel__organizations:read',
        effect: 'allow'
      },
      {
        subjectType: 'role',
        subjectId: superAdminRole._id,
        scopeType: 'global',
        right: 'admin_panel__organizations:write',
        effect: 'allow'
      },
      {
        subjectType: 'role',
        subjectId: superAdminRole._id,
        scopeType: 'global',
        right: 'admin_panel__notifications:read',
        effect: 'allow'
      },
      {
        subjectType: 'role',
        subjectId: superAdminRole._id,
        scopeType: 'global',
        right: 'admin_panel__notifications:write',
        effect: 'allow'
      },
      // Additional superadmin grants
      {
        subjectType: 'role',
        subjectId: superAdminRole._id,
        scopeType: 'global',
        right: 'rbac:*',
        effect: 'allow'
      },
      {
        subjectType: 'role',
        subjectId: superAdminRole._id,
        scopeType: 'global',
        right: 'system:*',
        effect: 'allow'
      },
      {
        subjectType: 'role',
        subjectId: superAdminRole._id,
        scopeType: 'global',
        right: '*',
        effect: 'allow'
      }
    ];

    console.log(`📋 Creating ${superAdminGrants.length} superadmin grants...`);

    for (const grantData of superAdminGrants) {
      // Check if grant already exists
      const existingGrant = await RbacGrant.findOne({
        subjectType: grantData.subjectType,
        subjectId: grantData.subjectId,
        scopeType: grantData.scopeType,
        right: grantData.right
      });

      if (existingGrant) {
        console.log(`ℹ️  Grant '${grantData.right}' already exists, skipping`);
        continue;
      }

      const grant = new RbacGrant(grantData);
      await grant.save();
      console.log(`✅ Created grant: ${grantData.right}`);
    }

    console.log('✅ All superadmin grants created successfully');
  } catch (error) {
    console.error('❌ Failed to create superadmin grants:', error);
    throw error;
  }
}

async function displaySummary() {
  try {
    const roleCount = await RbacRole.countDocuments();
    const grantCount = await RbacGrant.countDocuments();
    
    console.log('\n📊 RBAC System Summary:');
    console.log(`   Total Roles: ${roleCount}`);
    console.log(`   Total Grants: ${grantCount}`);
    
    // List all roles
    const roles = await RbacRole.find({}).select('key name status').sort({ key: 1 });
    console.log('\n📋 Available Roles:');
    roles.forEach(role => {
      console.log(`   • ${role.key} - ${role.name} (${role.status})`);
    });
    
    console.log('\n🎉 RBAC Admin System Bootstrap Complete!');
    console.log('💡 You can now create IAM users and assign them admin or superadmin roles');
    console.log('💡 Users with these roles will be able to access the admin panel based on RBAC permissions');
  } catch (error) {
    console.error('❌ Failed to display summary:', error);
  }
}

async function main() {
  console.log('🚀 Starting RBAC Admin System Bootstrap...\n');

  try {
    // Connect to database
    await connectToDatabase();

    // Create admin role and grants
    console.log('📦 Creating admin role and grants...');
    const adminRole = await createAdminRole();
    await createAdminGrants(adminRole);

    // Create superadmin role and grants
    console.log('\n📦 Creating superadmin role and grants...');
    const superAdminRole = await createSuperAdminRole();
    await createSuperAdminGrants(superAdminRole);

    // Display summary
    await displaySummary();

  } catch (error) {
    console.error('❌ Bootstrap failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the bootstrap
if (require.main === module) {
  main();
}

module.exports = {
  main,
  createAdminRole,
  createAdminGrants,
  createSuperAdminRole,
  createSuperAdminGrants
};
