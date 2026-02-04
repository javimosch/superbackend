require('dotenv').config();
const mongoose = require('mongoose');

async function countCollectionDocuments(collectionName, query = {}) {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/myappdb';
    await mongoose.connect(mongoUri);
    
    // Get database connection and count documents
    const db = mongoose.connection.db;
    const collection = db.collection(collectionName);
    const count = await collection.countDocuments(query);
    
    console.log(`Collection: ${collectionName}`);
    console.log(`Query: ${JSON.stringify(query)}`);
    console.log(`Count: ${count}`);
    
    // Return the count value
    return count;
    
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  } finally {
    // Always disconnect
    await mongoose.disconnect();
  }
}

// Example usage - count all documents in 'users' collection
countCollectionDocuments('users')
  .then(count => {
    console.log(`Final result: ${count}`);
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed:', error.message);
    process.exit(1);
  });
