const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const PORT       = 3333;
const CATALOG    = path.join(__dirname, 'catalogo-dia-dos-namorados.html');
const LING_DIR   = path.join(__dirname, 'Lingerie dia dos namorados');
const IMAGE_EXTS = new Set(['.jpg','.jpeg','.png','.webp','.gif']);

// ── helpers ───────────────────────────────────────────────────────────────────

function listImages(folder) {
  try {
    return fs.readdirSync(folder)
      .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .sort();
  } catch { return []; }
}

function parseSets(html) {
  const sets = [];
  const blockRe = /<!-- \d+ [^\n]+ -->\s*<div class="set-block">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
  let m;
  while ((m = blockRe.exec(html)) !== null) {
    const block = m[0];
    const num  = (block.match(/<span class="set-num">(\d+)<\/span>/) || [])[1] || '';
    const name = (block.match(/<h3 class="set-name">([^<]+)<\/h3>/)  || [])[1] || '';
    const desc = (block.match(/<p class="set-desc">([^<]+)<\/p>/)    || [])[1] || '';
    const imgs = [...block.matchAll(/src="([^"]+)"/g)].map(r => r[1]);
    sets.push({ num: parseInt(num), name, desc, images: imgs });
  }
  return sets;
}

function nextSetNum(html) {
  const nums = [...html.matchAll(/<span class="set-num">(\d+)<\/span>/g)]
    .map(m => parseInt(m[1]));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

function buildSetBlock(num, name, desc, images) {
  const paddedNum = String(num).padStart(2, '0');
  const imgTags = images.map(src =>
    `      <img src="${src}" alt="">`
  ).join('\n');
  return `
  <!-- ${paddedNum} ${name} -->
  <div class="set-block">
    <div class="set-header">
      <span class="set-num">${paddedNum}</span>
      <h3 class="set-name">${name}</h3>
      <p class="set-desc">${desc}</p>
    </div>
    <div class="set-rule"></div>
    <div class="set-gallery">
${imgTags}
    </div>
  </div>
`;
}

function insertSetBeforeClose(html, block) {
  const marker = '</section>\n\n\n<!-- ═══════════ PRODUTOS ERÓTICOS';
  return html.replace(marker, block + '\n' + marker);
}

function bodyParser(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
}

function serveFile(res, filePath, mime) {
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}

// ── admin UI HTML ─────────────────────────────────────────────────────────────

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lamorye — Admin Catálogo</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:system-ui,sans-serif;background:#0f0810;color:#e8d4cc;min-height:100vh}
  header{padding:1.5rem 2rem;border-bottom:1px solid rgba(212,164,85,.2);display:flex;align-items:center;gap:1rem}
  header h1{font-size:1.1rem;font-weight:400;letter-spacing:.1em;color:#d4a455}
  .container{max-width:1100px;margin:0 auto;padding:2rem}
  h2{font-size:.75rem;letter-spacing:.4em;text-transform:uppercase;color:#c94068;margin-bottom:1.5rem}
  .sets-list{display:grid;gap:.5rem;margin-bottom:3rem}
  .set-item{background:#1a0d18;border:1px solid rgba(212,164,85,.12);padding:.9rem 1.2rem;border-radius:4px;display:flex;align-items:center;gap:1rem;font-size:.85rem}
  .set-item .num{color:#d4a455;font-size:.7rem;letter-spacing:.2em;min-width:2rem}
  .set-item .name{flex:1;color:#f0dde3}
  .set-item .count{font-size:.7rem;color:#8a6575}
  hr{border:none;border-top:1px solid rgba(212,164,85,.15);margin:2rem 0}
  .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-bottom:1.5rem}
  label{display:block;font-size:.68rem;letter-spacing:.3em;text-transform:uppercase;color:#d4a455;margin-bottom:.5rem}
  input,textarea{width:100%;background:#12080f;border:1px solid rgba(212,164,85,.2);color:#e8d4cc;padding:.7rem .9rem;font-size:.85rem;font-family:inherit;border-radius:3px;outline:none}
  input:focus,textarea:focus{border-color:rgba(212,164,85,.5)}
  textarea{resize:vertical;min-height:80px}
  .gallery-picker{margin-bottom:1.5rem}
  .gallery-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:.4rem;max-height:340px;overflow-y:auto;background:#0a050e;padding:.8rem;border:1px solid rgba(212,164,85,.15);border-radius:3px}
  .gallery-grid img{width:100%;aspect-ratio:3/4;object-fit:cover;cursor:pointer;opacity:.45;border:2px solid transparent;border-radius:2px;transition:.15s}
  .gallery-grid img.selected{opacity:1;border-color:#d4a455}
  .selected-list{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.8rem;min-height:2rem;padding:.5rem;background:#0a050e;border:1px solid rgba(212,164,85,.1);border-radius:3px}
  .selected-tag{background:#2a1525;border:1px solid rgba(212,164,85,.25);padding:.2rem .6rem;font-size:.7rem;border-radius:2px;display:flex;align-items:center;gap:.4rem;color:#c0909c}
  .selected-tag button{background:none;border:none;color:#c94068;cursor:pointer;font-size:.9rem;line-height:1}
  .btn{background:none;border:1px solid #d4a455;color:#d4a455;padding:.7rem 2rem;font-size:.78rem;letter-spacing:.2em;text-transform:uppercase;cursor:pointer;border-radius:3px;transition:.2s}
  .btn:hover{background:rgba(212,164,85,.12)}
  .btn-primary{background:#c94068;border-color:#c94068;color:#fff}
  .btn-primary:hover{background:#a8304f}
  .msg{padding:.7rem 1rem;border-radius:3px;font-size:.82rem;margin-bottom:1rem;display:none}
  .msg.ok{background:rgba(100,200,100,.12);border:1px solid rgba(100,200,100,.3);color:#8eda8e}
  .msg.err{background:rgba(200,60,60,.12);border:1px solid rgba(200,60,60,.3);color:#e88}
  .actions{display:flex;gap:1rem;flex-wrap:wrap;align-items:center}
  @media(max-width:600px){.form-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<header>
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 21C12 21 3 14 3 8.5C3 5.46 5.46 3 8.5 3C10.24 3 11.91 3.81 13 5.08C14.09 3.81 15.76 3 17.5 3C20.54 3 23 5.46 23 8.5C23 14 12 21 12 21Z" fill="#c94068"/></svg>
  <h1>Lamorye · Gerenciar Catálogo</h1>
</header>

<div class="container">

  <h2>Conjuntos atuais</h2>
  <div class="sets-list" id="setsList">Carregando...</div>

  <hr>

  <h2>Adicionar novo conjunto</h2>
  <div class="msg" id="msg"></div>

  <div class="form-grid">
    <div>
      <label>Nome do conjunto</label>
      <input id="setName" type="text" placeholder="ex: Conjunto Rubi Intenso">
    </div>
    <div>
      <label>Descrição</label>
      <textarea id="setDesc" placeholder="ex: Renda vermelha com detalhes dourados..."></textarea>
    </div>
  </div>

  <div class="gallery-picker">
    <label>Selecione as fotos <span style="color:#8a6575;font-size:.65rem">(clique para marcar/desmarcar)</span></label>
    <div class="gallery-grid" id="galleryGrid">Carregando imagens...</div>
    <div class="selected-list" id="selectedList">
      <span style="color:#4e3040;font-size:.72rem">Nenhuma foto selecionada</span>
    </div>
  </div>

  <div class="actions">
    <button class="btn btn-primary" onclick="addSet()">Adicionar conjunto ao catálogo</button>
    <button class="btn" onclick="previewCatalog()">Abrir catálogo no navegador</button>
  </div>

</div>

<script>
let selected = [];
let allImages = [];

async function loadSets() {
  const r = await fetch('/api/sets');
  const sets = await r.json();
  const el = document.getElementById('setsList');
  if (!sets.length) { el.textContent = 'Nenhum conjunto encontrado.'; return; }
  el.innerHTML = sets.map(s =>
    \`<div class="set-item">
      <span class="num">\${String(s.num).padStart(2,'0')}</span>
      <span class="name">\${s.name}</span>
      <span class="count">\${s.images.length} foto\${s.images.length !== 1 ? 's' : ''}</span>
    </div>\`
  ).join('');
}

async function loadImages() {
  const r = await fetch('/api/images');
  allImages = await r.json();
  const grid = document.getElementById('galleryGrid');
  if (!allImages.length) { grid.textContent = 'Nenhuma imagem encontrada.'; return; }
  grid.innerHTML = allImages.map(f =>
    \`<img src="/img/\${encodeURIComponent(f)}" data-file="\${f}" onclick="toggleImage(this)" title="\${f}">\`
  ).join('');
}

function toggleImage(el) {
  const f = el.dataset.file;
  if (el.classList.contains('selected')) {
    el.classList.remove('selected');
    selected = selected.filter(x => x !== f);
  } else {
    el.classList.add('selected');
    selected.push(f);
  }
  renderSelected();
}

function renderSelected() {
  const el = document.getElementById('selectedList');
  if (!selected.length) {
    el.innerHTML = '<span style="color:#4e3040;font-size:.72rem">Nenhuma foto selecionada</span>';
    return;
  }
  el.innerHTML = selected.map(f =>
    \`<span class="selected-tag">\${f}<button onclick="removeSelected('\${f}')" title="Remover">×</button></span>\`
  ).join('');
}

function removeSelected(f) {
  selected = selected.filter(x => x !== f);
  document.querySelectorAll('#galleryGrid img').forEach(img => {
    if (img.dataset.file === f) img.classList.remove('selected');
  });
  renderSelected();
}

function showMsg(text, type) {
  const el = document.getElementById('msg');
  el.textContent = text;
  el.className = 'msg ' + type;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

async function addSet() {
  const name = document.getElementById('setName').value.trim();
  const desc = document.getElementById('setDesc').value.trim();
  if (!name) { showMsg('Preencha o nome do conjunto.', 'err'); return; }
  if (!selected.length) { showMsg('Selecione pelo menos uma foto.', 'err'); return; }

  const r = await fetch('/api/sets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, desc, images: selected })
  });
  const data = await r.json();
  if (data.ok) {
    showMsg('Conjunto "' + name + '" adicionado com sucesso!', 'ok');
    document.getElementById('setName').value = '';
    document.getElementById('setDesc').value = '';
    selected = [];
    document.querySelectorAll('#galleryGrid img.selected').forEach(i => i.classList.remove('selected'));
    renderSelected();
    loadSets();
  } else {
    showMsg('Erro: ' + (data.error || 'desconhecido'), 'err');
  }
}

function previewCatalog() {
  window.open('/catalog', '_blank');
}

loadSets();
loadImages();
</script>
</body>
</html>`;

// ── server ────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const parsed  = url.parse(req.url, true);
  const method  = req.method;
  const urlPath = parsed.pathname;

  // serve admin UI
  if (urlPath === '/' || urlPath === '/admin') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(ADMIN_HTML);
  }

  // serve the catalog HTML for preview
  if (urlPath === '/catalog') {
    return serveFile(res, CATALOG, 'text/html; charset=utf-8');
  }

  // serve lingerie images for thumbnail preview
  if (urlPath.startsWith('/img/')) {
    const fname = decodeURIComponent(urlPath.slice(5));
    const fpath = path.join(LING_DIR, fname);
    const ext   = path.extname(fname).toLowerCase();
    const mime  = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                    '.png': 'image/png',  '.webp': 'image/webp',
                    '.gif': 'image/gif' }[ext] || 'application/octet-stream';
    return serveFile(res, fpath, mime);
  }

  // GET /api/images — list all images in Lingerie folder
  if (urlPath === '/api/images' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(listImages(LING_DIR)));
  }

  // GET /api/sets — parse current sets from catalog
  if (urlPath === '/api/sets' && method === 'GET') {
    const html = fs.readFileSync(CATALOG, 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(parseSets(html)));
  }

  // POST /api/sets — add new set to catalog
  if (urlPath === '/api/sets' && method === 'POST') {
    const body = await bodyParser(req);
    const { name, desc, images } = body;
    if (!name || !images || !images.length) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'Dados incompletos.' }));
    }
    try {
      let html = fs.readFileSync(CATALOG, 'utf8');
      const num = nextSetNum(html);
      const srcImages = images.map(f => `Lingerie dia dos namorados/${f}`);
      const block = buildSetBlock(num, name, desc || '', srcImages);
      html = insertSetBeforeClose(html, block);
      fs.writeFileSync(CATALOG, html, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, num }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n  Lamorye Admin aberto em → http://localhost:${PORT}\n`);
  console.log('  Pressione Ctrl+C para fechar.\n');
});
