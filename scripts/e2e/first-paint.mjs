// Time to first painted page canvas, measured in headless Chromium.
//
//   node scripts/e2e/first-paint.mjs <base-url> [--runs=3] [--throttle=50,40]
//     [--issue=202609] [--phone] [--verbose]
//
// `--throttle=<Mbps>,<rtt ms>` shapes the connection with Chrome's network
// emulation so a localhost preview approximates a real link. Each run uses a
// fresh browser context (cold cache) and reports the PDF requests it saw, so
// you can tell range transport (many small 206s) from a whole-file download.
import { chromium, devices } from '@playwright/test';

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--'));
if (!base) {
  console.error('usage: node scripts/e2e/first-paint.mjs <base-url> [--runs=3] [--throttle=50,40] [--issue=202609] [--phone] [--verbose]');
  process.exit(1);
}
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const runs = Number(flag('runs', 3));
const issue = flag('issue', '202609');
const throttle = flag('throttle', '');
const phone = args.includes('--phone');
const verbose = args.includes('--verbose');
const [mbps, rtt] = throttle ? throttle.split(',').map(Number) : [0, 0];

const arm = `window.__firstCanvas = null;
new MutationObserver((_, mo) => {
  if (document.querySelector('.leaf-canvas canvas, .continuous-pages canvas')) {
    window.__firstCanvas = performance.now();
    mo.disconnect();
  }
}).observe(document, { childList: true, subtree: true });`;

const browser = await chromium.launch();
console.log(
  `${base} · ${runs} runs · ${throttle ? `${mbps} Mbps, ${rtt} ms RTT` : 'no throttling'}${phone ? ' · phone' : ' · desktop 1440×900'}`,
);
const times = [];
for (let i = 1; i <= runs; i++) {
  const context = await browser.newContext(
    phone ? devices['Pixel 7'] : { viewport: { width: 1440, height: 900 } },
  );
  const page = await context.newPage();
  const errors = [];
  const ranges = new Map();
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  page.on('request', (r) => {
    if (r.url().endsWith('.pdf'))
      ranges.set(r.url() + '#' + ranges.size, r.headers().range ?? 'full');
  });
  if (throttle) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: rtt,
      downloadThroughput: (mbps * 1e6) / 8,
      uploadThroughput: (mbps * 1e6) / 8,
    });
  }
  await page.addInitScript(arm);
  await page.goto(`${base.replace(/\/$/, '')}/#/${issue}/read`, {
    waitUntil: 'commit',
  });
  let first = null;
  try {
    await page.waitForFunction(() => window.__firstCanvas !== null, null, {
      timeout: 60_000,
    });
    first = await page.evaluate(() => window.__firstCanvas);
  } catch {
    first = null;
  }
  const pdf = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((e) => e.name.endsWith('.pdf'))
      .map((e) => ({
        bytes: e.transferSize,
        start: Math.round(e.startTime),
        end: Math.round(e.startTime + e.duration),
      })),
  );
  const bytes = pdf.reduce((sum, r) => sum + r.bytes, 0);
  const done = pdf.filter((r) => r.end > 0);
  console.log(
    `run ${i}: first canvas ${first === null ? 'not within 60 s' : `${Math.round(first)} ms`} · ${pdf.length} PDF request${pdf.length === 1 ? '' : 's'} ` +
      `(${(bytes / 1024 / 1024).toFixed(2)} MiB finished by first paint` +
      (done.length ? `, first at ${Math.min(...pdf.map((r) => r.start))} ms, last finished ${Math.max(...done.map((r) => r.end))} ms)` : ')'),
  );
  if (pdf.length <= 8) console.log('       ', JSON.stringify(pdf));
  if (verbose) {
    console.log('        ranges:', [...ranges.values()].join('  '));
    const waterfall = await page.evaluate((first) =>
      performance
        .getEntriesByType('resource')
        .filter((e) => first === null || e.startTime < first)
        .map((e) => `${Math.round(e.startTime)}-${Math.round(e.startTime + e.duration)} ${e.name.split('/').pop().slice(0, 40)} ${Math.round(e.transferSize / 1024)}K`),
      first,
    );
    console.log('        waterfall:\n          ' + waterfall.join('\n          '));
  }
  if (errors.length) console.log('        page errors:', errors.join(' | '));
  if (first !== null) times.push(first);
  await context.close();
}
await browser.close();
if (times.length) {
  const sorted = [...times].sort((a, b) => a - b);
  console.log(`median ${Math.round(sorted[Math.floor(sorted.length / 2)])} ms over ${times.length} run${times.length === 1 ? '' : 's'}`);
}
