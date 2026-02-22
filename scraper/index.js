const puppeteer = require('puppeteer');
const http = require('http');

// ---------------------------------------------------------------------------
// Resort terrain-page URLs (all Vail Resorts properties)
// ---------------------------------------------------------------------------
const TERRAIN_URLS = {
  // Colorado
  vail: 'https://www.vail.com/the-mountain/mountain-conditions/terrain-and-lift-status.aspx',
  beavercreek: 'https://www.beavercreek.com/the-mountain/mountain-conditions/terrain-and-lift-status.aspx',
  breckenridge: 'https://www.breckenridge.com/the-mountain/mountain-conditions/terrain-and-lift-status.aspx',
  keystone: 'https://www.keystoneresort.com/the-mountain/mountain-conditions/terrain-and-lift-status.aspx',
  crestedbutte: 'https://www.skicb.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  // Utah
  parkcity: 'https://www.parkcitymountain.com/the-mountain/mountain-conditions/terrain-and-lift-status.aspx',
  // Tahoe
  heavenly: 'https://www.skiheavenly.com/the-mountain/mountain-conditions/terrain-and-lift-status.aspx',
  northstar: 'https://www.northstarcalifornia.com/the-mountain/mountain-conditions/terrain-and-lift-status.aspx',
  kirkwood: 'https://www.kirkwood.com/the-mountain/mountain-conditions/terrain-and-lift-status.aspx',
  // Pacific NW
  stevenspass: 'https://www.stevenspass.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  whistlerblackcomb: 'https://www.whistlerblackcomb.com/the-mountain/mountain-conditions/terrain-and-lift-status.aspx',
  // Northeast
  stowe: 'https://www.stowe.com/the-mountain/mountain-conditions/terrain-and-lift-status.aspx',
  okemo: 'https://www.okemo.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  mtsnow: 'https://www.mountsnow.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  mountsunapee: 'https://www.mountsunapee.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  attitashmountain: 'https://www.attitash.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  wildcatmountain: 'https://www.skiwildcat.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  crotchedmountain: 'https://www.crotchedmtn.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  hunter: 'https://www.huntermtn.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  // Mid-Atlantic
  sevensprings: 'https://www.7springs.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  libertymountain: 'https://www.libertymountainresort.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  roundtopmountain: 'https://www.skiroundtop.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  whitetail: 'https://www.skiwhitetail.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  jackfrostbigboulder: 'https://www.jfbb.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  hiddenvalleypa: 'https://www.hiddenvalleyresort.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  laurelmountain: 'https://www.laurelmountainski.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  // Midwest
  aftonalps: 'https://www.aftonalps.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  mtbrighton: 'https://www.mtbrighton.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  wilmotmountain: 'https://www.wilmotmountain.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  alpinevalley: 'https://www.alpinevalleyohio.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  bmbw: 'https://www.bmbw.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  madrivermountain: 'https://www.skimadriver.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  hiddenvalley: 'https://www.hiddenvalleyski.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  snowcreek: 'https://www.skisnowcreek.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
  paolipeaks: 'https://www.paolipeaks.com/the-mountain/mountain-conditions/lift-and-terrain-status.aspx',
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 90_000;          // 90 seconds
const STALE_DROP_MS = 10 * 60_000;    // 10 minutes — drop from cache if unrequested
const CLEANUP_INTERVAL_MS = 60_000;   // run cleanup every 60 s
const PORT = 3000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// Per-resort cache: { data, fetchedAt, lastRequestedAt, scraping: bool }
const cache = {};

// Concurrency limiter for Puppeteer pages
const MAX_CONCURRENT_SCRAPES = 3;
let activeScrapes = 0;

// Shared browser instance (reused across scrapes)
let browser = null;
let browserLaunching = false;
let browserLaunchCooldown = 0;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ---------------------------------------------------------------------------
// Browser lifecycle
// ---------------------------------------------------------------------------
async function ensureBrowser() {
  if (browser && browser.isConnected()) return browser;
  if (Date.now() < browserLaunchCooldown) throw new Error('Browser launch on cooldown');

  // If another call is already launching, wait for it.
  if (browserLaunching) {
    const deadline = Date.now() + 30_000;
    while (browserLaunching && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (browserLaunching) throw new Error('Browser launch timed out (30s)');
    if (browser && browser.isConnected()) return browser;
    throw new Error('Browser launch failed (waited)');
  }

  browserLaunching = true;
  try {
    log('Launching browser');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    browser.on('disconnected', () => {
      log('Browser disconnected');
      browser = null;
    });
    return browser;
  } catch (e) {
    browserLaunchCooldown = Date.now() + 5000;
    throw e;
  } finally {
    browserLaunching = false;
  }
}

// ---------------------------------------------------------------------------
// Scrape a single resort
// ---------------------------------------------------------------------------
async function scrapeResort(slug) {
  const url = TERRAIN_URLS[slug];
  if (!url) return null;

  if (activeScrapes >= MAX_CONCURRENT_SCRAPES) {
    log(`[${slug}] Rejected: ${activeScrapes} scrapes already active`);
    return null;
  }
  activeScrapes++;

  const b = await ensureBrowser();
  let page;
  try {
    page = await b.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => typeof FR !== 'undefined' && FR.TerrainStatusFeed, { timeout: 15_000 });
    const data = await page.evaluate(() => {
      if (typeof FR !== 'undefined' && FR.TerrainStatusFeed) {
        return FR.TerrainStatusFeed;
      }
      return null;
    });
    if (data) {
      log(`[${slug}] Scraped ${(data.Lifts || []).length} lifts`);
    } else {
      log(`[${slug}] FR.TerrainStatusFeed not found`);
    }
    return data;
  } catch (e) {
    log(`[${slug}] Scrape failed: ${e.message}`);
    // If the browser itself crashed, null it so ensureBrowser relaunches next time
    if (browser && !browser.isConnected()) {
      browser = null;
    }
    return null;
  } finally {
    if (page) {
      try { await page.close(); } catch (_) { /* page may already be dead */ }
    }
    activeScrapes--;
  }
}

// ---------------------------------------------------------------------------
// On-demand fetch with caching + per-resort mutex
// ---------------------------------------------------------------------------
async function getResortData(slug) {
  const entry = cache[slug];
  const now = Date.now();

  // Mark this resort as recently requested (for stale cleanup)
  if (entry) entry.lastRequestedAt = now;

  // Cache hit — data is fresh
  if (entry && entry.data && (now - entry.fetchedAt) < CACHE_TTL_MS) {
    return entry.data;
  }

  // If a scrape is already in flight for this resort, wait for it.
  if (entry && entry.scraping) {
    // Wait up to 45 s for the in-flight scrape
    const deadline = now + 45_000;
    while (cache[slug] && cache[slug].scraping && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }
    const updated = cache[slug];
    return updated && updated.data ? updated.data : null;
  }

  // Start a new scrape
  if (!cache[slug]) {
    cache[slug] = { data: null, fetchedAt: 0, lastRequestedAt: now, scraping: false };
  }
  cache[slug].scraping = true;

  try {
    const data = await scrapeResort(slug);
    if (data) {
      cache[slug].data = data;
      cache[slug].fetchedAt = Date.now();
    }
    return cache[slug].data; // may still be previous stale data if scrape returned null
  } finally {
    cache[slug].scraping = false;
  }
}

// ---------------------------------------------------------------------------
// Periodic cleanup — drop resorts not requested in the last 10 minutes
// ---------------------------------------------------------------------------
setInterval(() => {
  const now = Date.now();
  for (const slug of Object.keys(cache)) {
    if (cache[slug].scraping) continue;
    if (now - cache[slug].lastRequestedAt > STALE_DROP_MS) {
      log(`[${slug}] Dropping from cache (idle ${Math.round((now - cache[slug].lastRequestedAt) / 1000)}s)`);
      delete cache[slug];
    }
  }
}, CLEANUP_INTERVAL_MS);

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const path = req.url.replace(/\/$/, '') || '/';

  // --- /health ---
  if (path === '/health') {
    const status = {};
    for (const slug of Object.keys(cache)) {
      status[slug] = {
        lastFetch: cache[slug].fetchedAt ? new Date(cache[slug].fetchedAt).toISOString() : null,
        lifts: cache[slug].data?.Lifts?.length || 0,
      };
    }
    res.end(JSON.stringify({ ok: true, cached: status }));
    return;
  }

  // --- /resorts ---
  if (path === '/resorts') {
    res.end(JSON.stringify(Object.keys(TERRAIN_URLS)));
    return;
  }

  // --- /{slug} ---
  const slug = path.slice(1); // strip leading /
  if (!TERRAIN_URLS[slug]) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: `Unknown resort: ${slug}` }));
    return;
  }

  try {
    const data = await getResortData(slug);
    if (!data) {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: 'No data yet — scrape in progress or failed' }));
    } else {
      res.end(JSON.stringify(data));
    }
  } catch (e) {
    log(`[${slug}] Request error: ${e.message}`);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Internal error' }));
  }
});

server.listen(PORT, () => log(`Scraper listening on :${PORT}`));

process.on('unhandledRejection', (err) => {
  log(`Unhandled rejection: ${err && err.message ? err.message : err}`);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
async function shutdown() {
  log('Shutting down');
  server.close();
  if (browser) {
    try { await browser.close(); } catch (_) {}
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
