const cluster = require('cluster');

if (cluster.isMaster) { // master code
	console.log('Spawning children...');
	cluster.fork(); // only fork once, this just allows the server to keep itself alive
	cluster.on('exit', (worker /*, code, signal */) => {
		console.log(`[${process.pid} @ ${new Date().toUTCString()}] Child ${worker.process.pid} died!`);
		cluster.fork(); // if server dies fork a new thread
	});

    return;
}

require('@nishimura-katsuo/require-hot-reload').init();

const jsthread = require('@nishimura-katsuo/jsthread');
const mod = require('module');
const fcgi = require('node-fastcgi');
const fs = require('fs');
const path = require('path');

let server = fcgi.createServer((req, res) => {
    let startTime = process.hrtime.bigint();

    try {
        req.startTime = startTime;

        let scriptPath = req.cgiParams['SCRIPT_NAME'];

        while (scriptPath[0] === '/') {
            scriptPath = scriptPath.slice(1);
        }
        scriptPath = path.resolve(req.cgiParams['DOCUMENT_ROOT'], scriptPath);

        try {
            scriptPath = mod._resolveFilename(scriptPath, this, false);
        } catch (err) {
            res.writeHead(404);
            res.end();
            return;
        }

        let script = require(scriptPath);

        if (typeof script !== 'function') {
            res.writeHead(500);
            res.end(`script ${scriptPath} does not export a function`);
        }
        else if (req.method === 'GET') {
            jsthread.spawn(script, { req, res, body: null }).then(ret => {
                if (!res.headersSent) {
                    res.writeHead(200, { 'Content-Type': 'application/json', 'x-request-duration': `${Number(process.hrtime.bigint() - startTime) / 1000000}ms` });
                    res.end(JSON.stringify(ret, null, ' '));
                } else {
                    ret = ret.toString();
                    res.end(ret);
                }
            }).catch(err => {
                if (!res.headersSent) {
                    res.writeHead(500);
                }

                res.end(err.stack);
            });
        } else if (req.method === 'POST') {
            let body = '';

            req.on('data', data => { body += data.toString(); });
            req.on('end', () => {
                jsthread.spawn(script, { req, res, body }).then(ret => {
                    if (!res.headersSent) {
                        res.writeHead(200, { 'Content-Type': 'application/json', 'x-request-duration': `${Number(process.hrtime.bigint() - startTime) / 1000000}ms` });
                        res.end(JSON.stringify(ret, null, ' '));
                    } else {
                        ret = ret.toString();
                        res.end(ret);
                    }
                }).catch(err => {
                    if (!res.headersSent) {
                        res.writeHead(500);
                    }

                    res.end(err.stack);
                });
            });
        } else {
            res.writeHead(501);
            res.end();
        }
    } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain', 'x-request-duration': `${Number(process.hrtime.bigint() - startTime) / 1000000}ms` });
        res.end(err.stack);
    }
});

let args = process.argv.slice(2), port = args.length ? args[0] : 4980;

server.listen({
    host: 'localhost',
    port,
    readableAll: true,
    writableAll: true,
});

console.log('Listening on port', port);
