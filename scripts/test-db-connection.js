// Test script to verify database connection works
console.log('Testing database connection...');

// Check connection status
const status = getConnectionStatus();
console.log('Connection status:', status);

if (status.hasActiveConnection) {
  console.log('✅ Database is connected');
  
  // Test counting documents
  try {
    const userCount = await countCollectionDocuments('users');
    console.log(`✅ Successfully counted users: ${userCount}`);
  } catch (error) {
    console.log('❌ Failed to count users:', error.message);
  }
} else {
  console.log('❌ Database is not connected');
}
