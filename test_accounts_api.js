const http = require('http');
const fs = require('fs');

// Read cookies for authentication
const cookies = fs.existsSync('cookies.txt') ? fs.readFileSync('cookies.txt', 'utf-8').trim() : '';

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/accounts',
  method: 'GET',
  headers: {
    'Cookie': cookies
  }
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const accounts = JSON.parse(data);
      console.log('Total accounts:', accounts.length);
      console.log('\nFirst 3 accounts with counts:');
      accounts.slice(0, 3).forEach(acc => {
        console.log(`- ${acc.name}: contactCount=${acc.contactCount}, projectCount=${acc.projectCount}`);
      });
    } catch (e) {
      console.log('Response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.end();
