const fs = require('fs');
const path = require('path');

const owner = 'Alexandre-Rafael';
const repo = 'lamorye';

// Helper to get file SHA from GitHub API
async function getSha(filePath, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Vercel-Serverless-Function'
    }
  });
  if (res.status === 200) {
    const data = await res.json();
    return data.sha;
  }
  return null;
}

// Helper to commit file to GitHub API
async function commitToGitHub(filePath, contentString, message, token) {
  const sha = await getSha(filePath, token);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  
  const body = {
    message: message,
    content: Buffer.from(contentString, 'utf8').toString('base64'),
    branch: 'main'
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Vercel-Serverless-Function'
    },
    body: JSON.stringify(body)
  });

  return res.status === 200 || res.status === 201;
}

// Compile index.html string from catalog data
function compileHtmlString(catalog, currentHtml) {
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
  let html = currentHtml;
  const startLing = html.indexOf('<!-- DYNAMIC_LINGERIE_START -->');
  const endLing = html.indexOf('<!-- DYNAMIC_LINGERIE_END -->');
  if (startLing !== -1 && endLing !== -1) {
    html = html.substring(0, startLing + '<!-- DYNAMIC_LINGERIE_START -->'.length) + lingerieHtml + html.substring(endLing);
  }
  
  const startProd = html.indexOf('<!-- DYNAMIC_PRODUCTS_START -->');
  const endProd = html.indexOf('<!-- DYNAMIC_PRODUCTS_END -->');
  if (startProd !== -1 && endProd !== -1) {
    html = html.substring(0, startProd + '<!-- DYNAMIC_PRODUCTS_START -->'.length) + productsHtml + html.substring(endProd);
  }
  
  return html;
}

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const catalogPath = path.join(process.cwd(), 'catalog.json');
  const htmlPath = path.join(process.cwd(), 'index.html');
  const token = process.env.GITHUB_TOKEN;

  if (req.method === 'GET') {
    if (fs.existsSync(catalogPath)) {
      res.status(200).json(JSON.parse(fs.readFileSync(catalogPath, 'utf8')));
    } else {
      res.status(404).json({ error: 'catalog.json not found' });
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const catalogData = req.body;
      const catalogStr = JSON.stringify(catalogData, null, 2);
      
      const currentHtml = fs.readFileSync(htmlPath, 'utf8');
      const updatedHtml = compileHtmlString(catalogData, currentHtml);

      if (token) {
        // We are on Vercel: commit directly to GitHub
        console.log('GitHub Token found, committing changes to GitHub...');
        const successJson = await commitToGitHub('catalog.json', catalogStr, 'Update catalog database from admin panel', token);
        const successHtml = await commitToGitHub('index.html', updatedHtml, 'Recompile index.html from admin panel', token);
        
        if (successJson && successHtml) {
          res.status(200).json({ success: true, message: 'Changes committed to GitHub. Vercel deployment triggered!' });
        } else {
          res.status(500).json({ success: false, error: 'Failed to commit changes to GitHub' });
        }
      } else if (process.env.VERCEL) {
        // Running on Vercel but GITHUB_TOKEN is missing
        res.status(400).json({
          success: false,
          error: 'Erro de permissão: A variável GITHUB_TOKEN não foi configurada nas configurações de variáveis de ambiente do projeto na Vercel.'
        });
      } else {
        // We are local: write directly to disk
        fs.writeFileSync(catalogPath, catalogStr, 'utf8');
        fs.writeFileSync(htmlPath, updatedHtml, 'utf8');
        res.status(200).json({ success: true, message: 'Changes saved locally!' });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }
};
