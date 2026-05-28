const puppeteer = require('puppeteer');
const sharp     = require('sharp');
const path      = require('path');
const fs        = require('fs');

const htmlPath   = 'file:///' + path.resolve(__dirname, 'catalogo-dia-dos-namorados.html').replace(/\\/g, '/');
const mobilePdf  = path.resolve(__dirname, 'catalogo-mobile.pdf');
const desktopPdf = path.resolve(__dirname, 'catalogo-desktop.pdf');

// Redimensiona imagens locais antes de passar ao Chrome para reduzir PDF
async function interceptImages(page, maxDim) {
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    if (req.resourceType() !== 'image') { req.continue(); return; }

    const url = req.url();
    if (!url.startsWith('file:///')) { req.continue(); return; }

    try {
      const filePath = decodeURIComponent(url.replace('file:///', '').replace(/\//g, path.sep));
      if (!fs.existsSync(filePath)) { req.continue(); return; }

      const buf = await sharp(filePath)
        .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: false })
        .toBuffer();

      req.respond({ status: 200, contentType: 'image/jpeg', body: buf });
    } catch {
      req.continue();
    }
  });
}

async function gerar(label, viewport, pdfOpts, maxImgDim) {
  console.log(`\nGerando ${label}...`);
  const browser = await puppeteer.launch({ headless: true });
  const page    = await browser.newPage();

  await page.setViewport(viewport);
  await page.emulateMediaType('screen');
  await interceptImages(page, maxImgDim);

  await page.goto(htmlPath, { waitUntil: 'load', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  await page.pdf({ printBackground: true, ...pdfOpts });
  await browser.close();

  const mb = (fs.statSync(pdfOpts.path).size / 1024 / 1024).toFixed(1);
  console.log(`  Salvo: ${pdfOpts.path}  (${mb} MB)`);
}

(async () => {
  // Mobile: páginas 430 × 932 px (iPhone), imagens redimensionadas para 860px max
  await gerar(
    'PDF Mobile',
    { width: 430, height: 932, deviceScaleFactor: 1 },
    { path: mobilePdf,  width: '430px', height: '932px' },
    860
  );

  // Desktop: páginas 1440 × 900 px, imagens redimensionadas para 1600px max
  await gerar(
    'PDF Desktop',
    { width: 1440, height: 900, deviceScaleFactor: 1 },
    { path: desktopPdf, width: '1440px', height: '900px' },
    1600
  );

  console.log('\nProntos!');
})();
