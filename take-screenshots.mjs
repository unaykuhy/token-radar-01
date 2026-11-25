import { chromium } from 'playwright';

const CHROMIUM_PATH = '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';

async function takeScreenshots() {
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 }
  });
  
  const baseUrl = 'file:///home/hatch/workspace/token-radar-01-fresh/out/dashboard/index.html';
  
  // Shot 1: Hero view (?view=hero)
  await page.goto(baseUrl + '?view=hero', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/home/hatch/workspace/token-radar-01-fresh/screenshots/1-hero.png' });
  console.log('Shot 1 done');
  
  // Shot 2: Live view (?view=live)
  await page.goto(baseUrl + '?view=live', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/home/hatch/workspace/token-radar-01-fresh/screenshots/2-live.png' });
  console.log('Shot 2 done');
  
  // Shot 3: RWA filtered split view (?view=split&category=RWA&detail=onre)
  await page.goto(baseUrl + '?view=split&category=RWA&detail=onre', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/home/hatch/workspace/token-radar-01-fresh/screenshots/3-rwa.png' });
  console.log('Shot 3 done');
  
  // Shot 4: Methodology view (?view=method)
  await page.goto(baseUrl + '?view=method', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/home/hatch/workspace/token-radar-01-fresh/screenshots/4-method.png' });
  console.log('Shot 4 done');
  
  await browser.close();
}

takeScreenshots().catch(e => { console.error(e); process.exit(1); });
