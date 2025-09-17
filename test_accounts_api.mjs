import http from 'http';
import fs from 'fs';

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
      console.log('\nAll accounts with counts:');
      accounts.forEach(acc => {
        console.log(`- ${acc.name}: contactCount=${acc.contactCount}, projectCount=${acc.projectCount}`);
      });
      console.log('\nFirst account full object:');
      console.log(JSON.stringify(accounts[0], null, 2));
    } catch (e) {
      console.log('Response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.end();
