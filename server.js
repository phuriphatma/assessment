#!/usr/bin/env node
// Minimal static server for local development (no external deps)
// Usage: node server.js [port]

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const port = parseInt(process.env.PORT || process.argv[2],10) || 8080;
const host = process.env.HOST || '0.0.0.0';
const root = __dirname;

const MIME = {
  '.html':'text/html; charset=UTF-8',
  '.js':'application/javascript; charset=UTF-8',
  '.css':'text/css; charset=UTF-8',
  '.mjs':'application/javascript; charset=UTF-8',
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
}).listen(port, host, ()=>{
  const ifaces = os.networkInterfaces();
  const addrs = [];
  Object.values(ifaces).forEach(list=>{
    (list||[]).forEach(iface=>{
      if(iface.family === 'IPv4' && !iface.internal){ addrs.push(iface.address); }
    });
  });
  console.log(`Static server running:`);
  console.log(`  • http://localhost:${port}`);
  addrs.forEach(ip=> console.log(`  • http://${ip}:${port}`));
  // Bonjour/mDNS hostname (may work on iPad via .local)
  try {
    const hn = os.hostname();
    if(hn) console.log(`  • http://${hn}.local:${port}`);
  } catch(_){}
  console.log('Press Ctrl+C to stop.');
});
