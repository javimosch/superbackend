require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const RbacUserRole = require('../src/models/RbacUserRole');
const RbacRole = require('../src/models/RbacRole');

async function createLimitedAdminUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { authSource: 'admin' });
    console.log('Connected to MongoDB');

    // Create a test user with limited-admin role
    const testUser = new User({
      email: 'limitedadmin@example.com',
      passwordHash: 'testpass123',
      name: 'Limited Admin User',
      role: 'limited-admin'
    });
    
    const savedUser = await testUser.save();
    console.log('Created limited-admin user:', savedUser.email);
    
    // Assign RBAC limited-admin role
    const limitedAdminRole = await RbacRole.findOne({ key: 'limited-admin' });
    if (!limitedAdminRole) {
      throw new Error('limited-admin role not found');
    }
    
    const assignment = new RbacUserRole({
      userId: savedUser._id,
      roleId: limitedAdminRole._id
    });
    await assignment.save();
    console.log('Assigned RBAC limited-admin role');
    
    console.log('✅ Limited admin user created successfully!');
    console.log('Email: limitedadmin@example.com');
    console.log('Password: testpass123');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

createLimitedAdminUser();
