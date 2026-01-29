#!/usr/bin/env node

// Simple test script to verify error reporting rate limiting
const http = require('http');

const BASE_URL = 'http://localhost:3000';

async function makeErrorRequest(authToken = null) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      severity: 'error',
      errorName: 'TestError',
      message: 'This is a test error for rate limiting verification',
      stack: 'Error: This is a test error\n    at test (test.js:1:1)',
      url: 'http://localhost:3000/test'
    });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/log/error',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    if (authToken) {
      options.headers['Authorization'] = `Bearer ${authToken}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          rateLimit: {
            limit: res.headers['x-ratelimit-limit'],
            remaining: res.headers['x-ratelimit-remaining']
          }
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function testRateLimiting() {
  console.log('🧪 Testing Error Reporting Rate Limiting\n');

  try {
    // Test anonymous user rate limiting (10 requests/minute)
    console.log('📋 Testing anonymous user rate limiting (10 req/min):');
    
    let successCount = 0;
    let rateLimitedCount = 0;
    
    for (let i = 1; i <= 15; i++) {
      try {
        const response = await makeErrorRequest();
        console.log(`  Request ${i}: ${response.statusCode} | Limit: ${response.rateLimit.limit}, Remaining: ${response.rateLimit.remaining}`);
        
        if (response.statusCode === 200) {
          successCount++;
        } else if (response.statusCode === 429) {
          rateLimitedCount++;
        }
      } catch (error) {
        console.log(`  Request ${i}: ERROR - ${error.message}`);
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`  ✅ Anonymous: ${successCount} successful, ${rateLimitedCount} rate limited\n`);

    // Test authenticated user rate limiting (30 requests/minute)
    console.log('📋 Testing authenticated user rate limiting (30 req/min):');
    
    successCount = 0;
    rateLimitedCount = 0;
    
    // Use a fake JWT token (this will fail auth but should still trigger rate limiting)
    const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0MTIzIiwicm9sZSI6InVzZXIiLCJpYXQiOjE2MzAwMDAwMDJ9.fake';
    
    for (let i = 1; i <= 35; i++) {
      try {
        const response = await makeErrorRequest(fakeToken);
        console.log(`  Request ${i}: ${response.statusCode} | Limit: ${response.rateLimit.limit}, Remaining: ${response.rateLimit.remaining}`);
        
        if (response.statusCode === 200) {
          successCount++;
        } else if (response.statusCode === 429) {
          rateLimitedCount++;
        }
      } catch (error) {
        console.log(`  Request ${i}: ERROR - ${error.message}`);
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`  ✅ Authenticated: ${successCount} successful, ${rateLimitedCount} rate limited\n`);
    
    console.log('🎉 Rate limiting test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Check if server is running
async function checkServer() {
  try {
    await makeErrorRequest();
    return true;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ Server is not running on localhost:3000');
      console.log('Please start the server with: npm start');
      return false;
    }
    return true; // Other errors might be expected
  }
}

async function main() {
  const serverRunning = await checkServer();
  if (!serverRunning) {
    process.exit(1);
  }
  
  await testRateLimiting();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

module.exports = { makeErrorRequest, testRateLimiting };
