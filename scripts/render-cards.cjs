#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');

function options(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--embed') result.embed = true;
    else if (arg === '--help') result.help = true;
    else if (['--html', '--out'].includes(arg) && argv[i + 1] && !argv[i + 1].startsWith('--')) result[arg.slice(2)] = argv[++i];
    else throw new Error('Unknown or incomplete argument: ' + arg);
  }
  return result;
}
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function main() {
  const args = options(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node render-cards.cjs --html <index.html> --out <directory> [--embed]\nRequires Playwright, Chromium and zip. Optional: PLAYWRIGHT_MODULE=<module path>, CHROME_PATH=<browser executable>.\nChecks five viewport widths and reading mode, exports 1080x1440 JPGs, creates cards-jpg.zip and qa-report.json. --embed refreshes offline download links in the HTML and verifies downloaded bytes.');
    return;
  }
  if (!args.html || !args.out) throw new Error('--html and --out are required; use --help.');
  const input = path.resolve(args.html), out = path.resolve(args.out);
  if (!fs.statSync(input).isFile()) throw new Error('HTML file is required.');
  fs.mkdirSync(out, { recursive: true });
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1700 }, deviceScaleFactor: 1, reducedMotion: 'reduce', acceptDownloads: true });
    const report = { viewports: [], cards: [], downloads: [], errors: [] };
    page.on('pageerror', e => report.errors.push(e.message));
    const url = pathToFileURL(input).href;
    const settle = async () => {
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(i => i.decode()));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      });
    };
    const mode = async desired => {
      if (await page.locator('body').getAttribute('data-view') !== desired) await page.locator('#view-toggle').click();
      await settle();
    };
    await page.goto(url);
    await settle();
    if (!await page.locator('.xhs-card').count()) throw new Error('No .xhs-card elements found.');
    for (const width of [375, 390, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 1700 });
      for (const view of ['card', 'read']) {
        await mode(view);
        const state = await page.evaluate(() => ({
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
          brokenImages: [...document.images].filter(i => !i.complete || !i.naturalWidth).length,
          cards: [...document.querySelectorAll('.xhs-card')].map(c => {
            const rect = c.getBoundingClientRect();
            const footer = c.querySelector('.foot');
            if (!footer || !c.querySelector('.content')) throw new Error('Each card needs .content and .foot.');
            const bottom = Math.max(...[...c.querySelector('.content').children].map(el => el.getBoundingClientRect().bottom));
            return { contentOverlapsFooter: bottom > footer.getBoundingClientRect().top + 1, footerClipped: footer.getBoundingClientRect().bottom > rect.bottom + 1 };
          })
        }));
        report.viewports.push({ width, mode: view, ...state });
        if (state.horizontalOverflow || state.brokenImages || state.cards.some(c => c.contentOverlapsFooter || c.footerClipped)) throw new Error('Layout check failed: ' + JSON.stringify(report.viewports.at(-1)));
      }
    }
    await mode('card');
    const nav = page.locator('nav a');
    if (await nav.count()) {
      const link = nav.last(), target = await link.getAttribute('href');
      await link.click();
      if (!page.url().endsWith(target)) throw new Error('Card navigation failed.');
    }
    await page.locator('#view-toggle').focus();
    await page.keyboard.press('Tab');
    if (!await page.evaluate(() => document.activeElement.matches(':focus-visible'))) throw new Error('Keyboard focus is not visible.');
    await page.setViewportSize({ width: 1200, height: 1700 });
    const style = await page.addStyleTag({ content: '.xhs-frame{width:1080px!important;height:1440px!important}.xhs-card{transform:none!important;width:1080px!important;height:1440px!important}html{scroll-behavior:auto!important}' });
    await settle();
    const cards = page.locator('.xhs-card');
    for (let i = 0; i < await cards.count(); i++) {
      const card = cards.nth(i);
      const dimensions = await card.evaluate(c => ({ width: c.offsetWidth, height: c.offsetHeight, overflow: c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1 }));
      if (dimensions.width !== 1080 || dimensions.height !== 1440 || dimensions.overflow) throw new Error('Invalid export dimensions on card ' + (i + 1));
      const name = `card-${String(i + 1).padStart(2, '0')}.jpg`;
      await card.screenshot({ path: path.join(out, name), type: 'jpeg', quality: 96, animations: 'disabled' });
      const bytes = fs.readFileSync(path.join(out, name));
      report.cards.push({ name, width: 1080, height: 1440, bytes: bytes.length, sha256: sha(bytes) });
    }
    await style.evaluate(el => el.remove());
    const temporaryZip = path.join(out, `.cards-${crypto.randomUUID()}.zip`);
    execFileSync('zip', ['-q', '-j', temporaryZip, ...report.cards.map(c => path.join(out, c.name))]);
    fs.renameSync(temporaryZip, path.join(out, 'cards-jpg.zip'));
    const entries = [{ key: 'zip', name: 'cards-jpg.zip', mime: 'application/zip' }, ...report.cards.map((c, i) => ({ key: String(i + 1).padStart(2, '0'), name: c.name, mime: 'image/jpeg' }))];
    if (args.embed) {
      let html = fs.readFileSync(input, 'utf8');
      // Serialize download attributes in the original HTML; keep the editable source structure.
      for (const entry of entries) {
        const bytes = fs.readFileSync(path.join(out, entry.name));
        const escaped = entry.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`<a\\b(?=[^>]*data-xhs-download=["']${escaped}["'])[^>]*>`, 'g');
        let found = false;
        html = html.replace(pattern, tag => {
          found = true;
          const href = `href="data:${entry.mime};base64,${bytes.toString('base64')}"`;
          return /\bhref=["'][^"']*["']/.test(tag) ? tag.replace(/\bhref=["'][^"']*["']/, href) : tag.replace(/>$/, ' ' + href + '>');
        });
        if (!found) throw new Error('Missing download slot: ' + entry.key);
        report.downloads.push({ key: entry.key, name: entry.name, bytes: bytes.length, sha256: sha(bytes) });
      }
      fs.writeFileSync(input, html);
      await page.goto(url);
      await settle();
      for (const entry of report.downloads) {
        const link = page.locator(`[data-xhs-download="${entry.key}"]`).first();
        const href = await link.getAttribute('href');
        if (sha(Buffer.from(href.slice(href.indexOf(',') + 1), 'base64')) !== entry.sha256) throw new Error('Embedded bytes mismatch: ' + entry.name);
        const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
        if (sha(fs.readFileSync(await download.path())) !== entry.sha256) throw new Error('Downloaded bytes mismatch: ' + entry.name);
        entry.browserDownloadVerified = true;
      }
    }
    if (report.errors.length) throw new Error(report.errors.join('\n'));
    fs.writeFileSync(path.join(out, 'qa-report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`Exported ${report.cards.length} cards at 1080x1440. Checked 5 viewports, reading mode, navigation${args.embed ? ' and offline downloads' : ''}.\n${out}`);
  } finally {
    await browser.close();
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
