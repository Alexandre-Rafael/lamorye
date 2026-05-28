import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const htmlPath = path.resolve(__dirname, 'catalogo-dia-dos-namorados.html');
const pdfPath  = path.resolve(__dirname, 'catalogo-mobile.pdf');

(async () => {
  console.log('Abrindo navegador...');
  const browser = await puppeteer.launch({ headless: true });
  const page    = await browser.newPage();

  // viewport mobile (430 × 932 = iPhone 14 Plus)
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });

  // usar layout screen para respeitar media queries mobile
  await page.emulateMediaType('screen');

  console.log('Carregando catálogo...');
  await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, {
    waitUntil: 'networkidle0',
    timeout: 30000,
  });

  // aguarda Google Fonts carregar completamente
  await page.evaluateHandle('document.fonts.ready');
  await new Promise(r => setTimeout(r, 1500));

  console.log('Gerando PDF...');
  await page.pdf({
    path: pdfPath,
    printBackground: true,
    width:  '430px',
    height: '932px',
  });

  await browser.close();
  console.log('Pronto! Arquivo salvo em:', pdfPath);
})();
