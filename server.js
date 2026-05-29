const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3000;
const PUBLIC_DIR = __dirname;

// Helper to compile index.html from catalog.json
function compileHtml() {
  const catalogPath = path.join(PUBLIC_DIR, 'catalog.json');
  if (!fs.existsSync(catalogPath)) return;
  
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const htmlPath = path.join(PUBLIC_DIR, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  
  // 1. Generate Lingerie Sets HTML
  let lingerieHtml = '\n';
  catalog.lingerieSets.forEach(set => {
    lingerieHtml += `  <!-- ${set.id} ${set.name} -->\n`;
    lingerieHtml += `  <div class="set-block">\n`;
    lingerieHtml += `    <div class="set-header">\n`;
    lingerieHtml += `      <span class="set-num">${set.id}</span>\n`;
    lingerieHtml += `      <h3 class="set-name">${set.name}</h3>\n`;
    lingerieHtml += `      <p class="set-desc">${set.description}</p>\n`;
    lingerieHtml += `    </div>\n`;
    lingerieHtml += `    <div class="set-rule"></div>\n`;
    lingerieHtml += `    <div class="set-gallery">\n`;
    set.images.forEach(img => {
      lingerieHtml += `      <img src="${img}" alt="">\n`;
    });
    lingerieHtml += `    </div>\n`;
    lingerieHtml += `  </div>\n\n`;
  });
  
  // 2. Generate Product Categories HTML
  let productsHtml = '\n';
  catalog.productCategories.forEach(cat => {
    productsHtml += `  <!-- ${cat.category.toUpperCase().replace(/&AMP;/g, '&')} -->\n`;
    productsHtml += `  <div class="cat-block">\n`;
    productsHtml += `    <div class="cat-header">\n`;
    productsHtml += `      <h3 class="cat-title">${cat.category}</h3>\n`;
    productsHtml += `      <div class="cat-rule"></div>\n`;
    productsHtml += `    </div>\n`;
    productsHtml += `    <div class="prod-grid">\n`;
    
    cat.products.forEach(prod => {
      productsHtml += `      <div class="prod-card">\n`;
      if (prod.image === 'placeholder' || !prod.image) {
        productsHtml += `        <div class="prod-no-img">\n`;
        productsHtml += `          <div class="prod-no-img-icon">✦</div>\n`;
        productsHtml += `          <div class="prod-no-img-label">Consulte disponibilidade</div>\n`;
        productsHtml += `        </div>\n`;
      } else {
        const darkBg = ['IMG_2476.JPG', 'IMG_2477.JPG', 'IMG_2478.JPG', 'IMG_2479.JPG'].includes(prod.image);
        productsHtml += `        <div class="prod-img-wrap${darkBg ? ' dark-bg' : ''}"><img src="${prod.image}" alt="${prod.name}"></div>\n`;
      }
      productsHtml += `        <div class="prod-body">\n`;
      productsHtml += `          <p class="prod-name">${prod.name}</p>\n`;
      productsHtml += `          <p class="prod-desc">${prod.description}</p>\n`;
      productsHtml += `        </div>\n`;
      productsHtml += `      </div>\n`;
    });
    
    productsHtml += `    </div>\n`;
    productsHtml += `  </div>\n\n`;
  });
  
  // 3. Splice into index.html
  const startLing = html.indexOf('<!-- DYNAMIC_LINGERIE_START -->');
  const endLing = html.indexOf('<!-- DYNAMIC_LINGERIE_END -->');
  if (startLing !== -1 && endLing !== -1) {
    html = html.substring(0, startLing + '<!-- DYNAMIC_LINGERIE_START -->'.length) + lingerieHtml + html.substring(endLing);
  }
  
  // Refresh indices since length changed
  const startProd = html.indexOf('<!-- DYNAMIC_PRODUCTS_START -->');
  const endProd = html.indexOf('<!-- DYNAMIC_PRODUCTS_END -->');
  if (startProd !== -1 && endProd !== -1) {
    html = html.substring(0, startProd + '<!-- DYNAMIC_PRODUCTS_START -->'.length) + productsHtml + html.substring(endProd);
  }
  
  fs.writeFileSync(htmlPath, html, 'utf8');
}

// Function to recursively scan files in a folder
function getFilesRecursively(dir, rootDir, result = []) {
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && !file.startsWith('.')) {
        getFilesRecursively(fullPath, rootDir, result);
      }
    } else {
      const ext = path.extname(file).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
        // Compute relative path from rootDir
        const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
        result.push(relPath);
      }
    }
  });
  return result;
}

const server = http.createServer((req, res) => {
  // Disable caching for api requests
  if (req.url.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  }

  // Handle API requests
  if (req.method === 'GET' && req.url === '/api/catalog') {
    const catalogPath = path.join(PUBLIC_DIR, 'catalog.json');
    if (fs.existsSync(catalogPath)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(fs.readFileSync(catalogPath, 'utf8'));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'catalog.json not found' }));
    }
    return;
  }
  
  if (req.method === 'POST' && req.url === '/api/catalog') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const catalogData = JSON.parse(body);
        fs.writeFileSync(path.join(PUBLIC_DIR, 'catalog.json'), JSON.stringify(catalogData, null, 2), 'utf8');
        compileHtml();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Catalog saved and index.html compiled!' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  
  if (req.method === 'GET' && req.url === '/api/images') {
    try {
      const images = getFilesRecursively(PUBLIC_DIR, PUBLIC_DIR);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(images));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/upload') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { filename, base64 } = JSON.parse(body);
        if (!filename || !base64) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Filename and base64 content are required' }));
          return;
        }
        const cleanFilename = filename.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\.-]/g, '');
        const filePath = path.join(PUBLIC_DIR, cleanFilename);
        const buffer = Buffer.from(base64, 'base64');
        fs.writeFileSync(filePath, buffer);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, url: cleanFilename, message: 'Image saved locally!' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  
  if (req.method === 'POST' && req.url === '/api/build-pdf') {
    exec('node gerar-pdf-mobile.js', (err, stdout, stderr) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message, stderr }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, output: stdout }));
      }
    });
    return;
  }

  // Serve static files
  let reqUrl = req.url === '/' || req.url === '/admin' ? '/admin.html' : req.url;
  // Prevent directory traversal
  reqUrl = path.normalize(reqUrl).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, decodeURIComponent(reqUrl));
  
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf'
    };
    
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(fs.readFileSync(filePath));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('<h1>404 Not Found</h1>');
  }
});

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`  Painel Administrativo da Lamorye Iniciado!`);
  console.log(`  Acesse no navegador: http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});
