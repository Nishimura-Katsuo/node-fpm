require('@nishimura-katsuo/require-hot-reload').init();
const jsthread = require('@nishimura-katsuo/jsthread');
const mod = require('module');
const fcgi = require('node-fastcgi');
const fs = require('fs');
const path = require('path');

let server = fcgi.createServer(function(req, res) {
    try {
        let scriptPath = req.cgiParams['SCRIPT_NAME'];

        while (scriptPath[0] === '/') {
            scriptPath = scriptPath.slice(1);
        }

        scriptPath = path.resolve(req.cgiParams['DOCUMENT_ROOT'], scriptPath);
        scriptPath = mod._resolveFilename(scriptPath, this, false);

        let script = require(scriptPath);

        if (req.method === 'GET') {
            jsthread.spawn(script, req, res, null).then(ret => {
                if (!res.headersSent) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(ret, null, ' '));
                } else {
                    ret = ret.toString();
                    res.end(ret);
                }
            }).catch(err => {
                res.writeHead(500);
                res.end(err.stack);
            });
        } else if (req.method === 'POST') {
            let body = "";

            req.on('data', function(data) { body += data.toString(); });
            req.on('end', function() {
                jsthread.spawn(script, req, res, body).then(ret => {
                    if (!res.headersSent) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(ret, null, ' '));
                    } else {
                        ret = ret.toString();
                        res.end(ret);
                    }
                }).catch(err => {
                    res.writeHead(500);
                    res.end(err.stack);
                });
            });
        } else {
            res.writeHead(501);
            res.end();
        }
    } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') {
            res.writeHead(404);
            res.end();
        } else {
            res.writeHead(500);
            res.end(err.stack);
        }
    }
});

let socketName = path.resolve('/tmp', 'node-fcgi.sock');

if (fs.existsSync(socketName)) {
    fs.unlinkSync(socketName);
}

server.listen({
    path: socketName,
    readableAll: true,
    writableAll: true,
});
