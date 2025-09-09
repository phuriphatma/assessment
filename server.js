#!/usr/bin/env node
// Minimal static server for local development (no external deps)
// Usage: node server.js [port]

const http = require('http');
const fs = require('fs');
const path = require('path');

const port = parseInt(process.argv[2],10) || 8080;
const root = __dirname;

const MIME = {
  '.html':'text/html; charset=UTF-8',
  '.js':'application/javascript; charset=UTF-8',
  '.css':'text/css; charset=UTF-8',
  '.json':'application/json; charset=UTF-8',
  '.pdf':'application/pdf',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.svg':'image/svg+xml'
};

http.createServer((req,res)=>{
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if(urlPath === '/' || urlPath === '') urlPath = '/index.html';
  const filePath = path.join(root, urlPath);
  if(!filePath.startsWith(root)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(filePath,(err,st)=>{
    if(err || !st.isFile()){
      res.writeHead(404); return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control':'no-cache' });
    fs.createReadStream(filePath).pipe(res);
  });
}).listen(port, ()=>{
  console.log(`Static server running at http://localhost:${port}`);
  console.log('Press Ctrl+C to stop.');
});
