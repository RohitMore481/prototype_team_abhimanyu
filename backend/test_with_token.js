const jwt = require('jsonwebtoken');
const http = require('http');

const SECRET = 'my_super_secret_jwt_key_12345';
const userId = 1;
const projectId = 7;
const machineId = 1;

const token = jwt.sign({ id: userId, role: 'admin' }, SECRET);

const options = {
    hostname: 'localhost',
    port: 5000,
    path: `/api/projects/${projectId}/assign-machine`,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
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

req.write(JSON.stringify({ machineId }));
req.end();
