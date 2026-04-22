const http = require('http');

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/projects/1/assign-machine', // Assuming ID 1 exists or will return 404/500
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token' // This will fail auth, but I want to see if I get 500 or 401
    }
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
        console.log(`BODY: ${chunk}`);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

// write data to request body
req.write(JSON.stringify({ machineId: 1 }));
req.end();
