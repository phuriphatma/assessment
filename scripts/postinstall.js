// Copy pdfjs-dist assets into ./pdfjs for GitHub Pages and local dev
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname,'..','node_modules','pdfjs-dist','build');
const destDir = path.join(__dirname,'..','pdfjs');
function copyIfExists(name){
  const src = path.join(srcDir,name);
  if(fs.existsSync(src)){
    fs.copyFileSync(src, path.join(destDir,name));
    console.log('Copied', name);
  } else {
    console.log('Missing', name);
  }
}
if(!fs.existsSync(destDir)) fs.mkdirSync(destDir);
['pdf.mjs','pdf.worker.mjs','pdf.js','pdf.worker.js','pdf.min.js','pdf.worker.min.js'].forEach(copyIfExists);
