const puppeteer = require('puppeteer');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
const TRAILMAP_CACHE_TTL_MS = 24 * 60 * 60_000;  // 24 hours
const TRAILMAP_STALE_DROP_MS = 5 * 60_000;        // 5 min idle → drop (images are large)
const PORT = 3000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// Per-resort cache: { data, fetchedAt, lastRequestedAt, scraping: bool }
const cache = {};

// Trail map image cache: { [slug]: { data: Buffer, contentType, fetchedAt, lastRequestedAt, fetching } }
const trailMapCache = {};

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
  // Trail map cache cleanup (shorter idle threshold — images are large)
  for (const slug of Object.keys(trailMapCache)) {
    if (trailMapCache[slug].fetching) continue;
    if (now - trailMapCache[slug].lastRequestedAt > TRAILMAP_STALE_DROP_MS) {
      log(`[trailmap:${slug}] Dropping from cache (idle ${Math.round((now - trailMapCache[slug].lastRequestedAt) / 1000)}s)`);
      delete trailMapCache[slug];
    }
  }
}, CLEANUP_INTERVAL_MS);

// ---------------------------------------------------------------------------
// Alta: lightweight HTML fetch + regex extraction (no Puppeteer)
// ---------------------------------------------------------------------------
const ALTA_URL = 'https://www.alta.com/lift-terrain-status';
let altaCache = { data: null, fetchedAt: 0, fetching: false };

function fetchAltaHTML() {
  return new Promise((resolve, reject) => {
    const req = https.get(ALTA_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Alta HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Alta request timeout')); });
  });
}

async function getAltaData() {
  const now = Date.now();
  if (altaCache.data && (now - altaCache.fetchedAt) < CACHE_TTL_MS) {
    return altaCache.data;
  }

  // If another fetch is in flight, wait for it
  if (altaCache.fetching) {
    const deadline = Date.now() + 20_000;
    while (altaCache.fetching && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }
    if (altaCache.data) return altaCache.data;
  }

  altaCache.fetching = true;
  try {
    const html = await fetchAltaHTML();
    const match = html.match(/window\.Alta\s*=\s*(\{.*?\});\s*<\/script>/);
    if (!match) throw new Error('Could not extract Alta data from HTML');
    const alta = JSON.parse(match[1]);
    const parsed = alta.liftStatus || {};
    if (!parsed.lifts) throw new Error('No liftStatus.lifts in Alta data');
    altaCache.data = parsed;
    altaCache.fetchedAt = Date.now();
    log(`[alta] Fetched ${(parsed.lifts || []).length} lifts`);
    return parsed;
  } finally {
    altaCache.fetching = false;
  }
}

// ---------------------------------------------------------------------------
// Generic HTTPS fetch helpers
// ---------------------------------------------------------------------------
function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        return fetchHTML(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function fetchImageBuffer(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchImageBuffer(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const contentType = (res.headers['content-type'] || 'image/jpeg').split(';')[0].trim();
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ data: Buffer.concat(chunks), contentType }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Image fetch timeout')); });
  });
}

// ---------------------------------------------------------------------------
// Trail map: discover + fetch + cache
// ---------------------------------------------------------------------------

// HEAD-request validation: confirm a scene7 URL actually returns 200
function headCheck(url) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'HEAD',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(10000, () => { req.destroy(); resolve(false); });
    req.end();
  });
}

// Known scene7 asset IDs for resorts where auto-discovery fails.
// Reasons vary: page uses trail-maps.aspx (plural), scene7 img not in DOM,
// non-standard naming (Vail has "front-side-logos", Crotched has a "trial" typo),
// or the scene7 URL derived from the PDF name returns 403.
const SCENE7_TRAIL_MAP_OVERRIDES = {
  parkcity: 'FY23%20Park%20City%20Winter%20Trail%20Map-1',
  vail: '20251001_VL_winter-front-side-logos-trail_map_001',
  crestedbutte: '20231102_CB_winter-trail_map_001',
  heavenly: '20241105_HV_winter-trail_map_001',
  mtsnow: '20251103_SO_winter-trail_map_001',
  mountsunapee: '20251226_MS_winter-trail_map_001',
  crotchedmountain: '20251226_CR_winter-trial_map_001', // typo in asset name is intentional
  hiddenvalley: '20251121_HI_winter-trail_map_001',
  snowcreek: '20251121_SC_winter-trail_map_001',
};

// Direct image URL overrides for resorts where scene7 has no trail map image
// and the PDF is a brochure layout rather than a clean trail map.
const IMAGE_TRAIL_MAP_OVERRIDES = {
  stevenspass: 'https://cdn.bfldr.com/WIENNW6Q/as/36kw93v5sb3gbtb3qshq/Stevens_Pass_Resort',
};

// PDF fallback URLs for resorts where scene7 blocks image access (403).
// These are converted to JPEG on-the-fly via pdftoppm.
const PDF_TRAIL_MAP_OVERRIDES = {
  whistlerblackcomb: 'https://www.whistlerblackcomb.com/-/aemasset/sitecore/whistler-blackcomb/maps/winter-2025-2026/20251023_WB_winter-trail_map_001.pdf',
  libertymountain: 'https://www.libertymountainresort.com/-/aemasset/sitecore/liberty/maps/20241122_LB_winter-trail_map_001.pdf',
  madrivermountain: 'https://www.skimadriver.com/-/aemasset/sitecore/mad-river/maps/20251113_MA_winter-trail_map_001.pdf',
};

// Per-resort PDF page to render (default: 1). Whistler's page 1 is marketing; page 2 is the trail map.
const PDF_PAGE_OVERRIDES = {
  whistlerblackcomb: 2,
};

// Per-resort crop: keep only the top N% of the image (removes brochure text/ads at bottom).
// Applied after fetch or PDF conversion via ImageMagick convert.
const TRAIL_MAP_CROP_PCT = {
  stevenspass: 58,
  whistlerblackcomb: 78,
};

// Vail Resorts: derive trail map image URL from their trail-map.aspx page.
// Three strategies: (0) known override, (1) scene7 <img> tags, (2) PDF asset ID.
// All validated with a HEAD request before committing.
async function discoverVailTrailMapUrl(slug) {
  const terrainUrl = TERRAIN_URLS[slug];
  if (!terrainUrl) return null;

  // Strategy 0: Known override for this resort
  if (SCENE7_TRAIL_MAP_OVERRIDES[slug]) {
    const assetId = SCENE7_TRAIL_MAP_OVERRIDES[slug];
    const imageUrl = `https://scene7.vailresorts.com/is/image/vailresorts/${assetId}?wid=4000&resMode=sharp2`;
    log(`[trailmap:${slug}] Strategy 0 (override): ${imageUrl}`);
    if (await headCheck(imageUrl)) return imageUrl;
    log(`[trailmap:${slug}] Strategy 0 failed HEAD check, trying Puppeteer discovery`);
  }

  const origin = terrainUrl.match(/^https?:\/\/[^/]+/)[0];
  const trailMapPageUrl = origin + '/the-mountain/about-the-mountain/trail-map.aspx';

  log(`[trailmap:${slug}] Loading trail map page via Puppeteer: ${trailMapPageUrl}`);
  const b = await ensureBrowser();
  let page;
  try {
    page = await b.newPage();
    await page.goto(trailMapPageUrl, { waitUntil: 'networkidle2', timeout: 30_000 });

    // Strategy 1: Find scene7 <img> tags directly on the rendered page
    const scene7Imgs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img'))
        .filter(i => i.src.includes('scene7') && /trail.map|trail_map/i.test(i.src + i.alt))
        .filter(i => /winter|Winter|FY\d{2}/i.test(i.src) || !/summer|bike|hike/i.test(i.src))
        .map(i => i.src);
    });

    if (scene7Imgs.length > 0) {
      const imgMatch = scene7Imgs[0].match(/\/is\/image\/vailresorts\/([^?]+)/);
      if (imgMatch) {
        const assetId = decodeURIComponent(imgMatch[1]);
        const imageUrl = `https://scene7.vailresorts.com/is/image/vailresorts/${encodeURIComponent(assetId)}?wid=4000&resMode=sharp2`;
        log(`[trailmap:${slug}] Strategy 1 (scene7 img): ${imageUrl}`);
        if (await headCheck(imageUrl)) return imageUrl;
        log(`[trailmap:${slug}] Strategy 1 failed HEAD check, trying fallback`);
      }
    }

    // Strategy 2: Fall back to PDF asset ID → scene7 mapping
    const html = await page.content();
    const pdfMatch = html.match(/\/(\d{8}_[A-Z]{2,}_winter[^/]*?trail[^/]*?map[^/]*?)\.pdf/i);
    if (pdfMatch) {
      const assetId = pdfMatch[1];
      const imageUrl = `https://scene7.vailresorts.com/is/image/vailresorts/${assetId}?wid=4000&resMode=sharp2`;
      log(`[trailmap:${slug}] Strategy 2 (PDF asset): ${imageUrl}`);
      if (await headCheck(imageUrl)) return imageUrl;
      log(`[trailmap:${slug}] Strategy 2 failed HEAD check`);
    }

    log(`[trailmap:${slug}] No valid trail map URL found`);
    return null;
  } catch (e) {
    log(`[trailmap:${slug}] Puppeteer discovery failed: ${e.message}`);
    if (browser && !browser.isConnected()) browser = null;
    return null;
  } finally {
    if (page) {
      try { await page.close(); } catch (_) {}
    }
  }
}

// Alta: static Cloudinary URL
const ALTA_TRAILMAP_URL = 'https://res.cloudinary.com/altaskiarea/image/upload/f_jpg,q_80/v1759862875/resources/Maps/Alta_Trailmap_2025_26_Small.jpg';

// Snowbird: official CMS image
const SNOWBIRD_TRAILMAP_URL = 'https://cms.snowbird.com/sites/default/files/2025-11/snowbird_trailmap_winter_2526.jpg';

// Fetch a URL as a raw buffer without browser-like User-Agent.
// Vail's Akamai CDN serves WAF challenge pages to browser UAs on PDF assets.
function fetchRawBuffer(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'curl/8.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchRawBuffer(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('PDF fetch timeout')); });
  });
}

// Convert a PDF to JPEG using pdftoppm (poppler-utils).
// Downloads the PDF, renders the specified page at 300 DPI, returns image buffer.
async function renderPdfAsImage(pdfUrl, pageNum) {
  const pg = pageNum || 1;
  log(`[trailmap] Downloading PDF for conversion (page ${pg}): ${pdfUrl}`);
  const pdfBuffer = await fetchRawBuffer(pdfUrl);

  const tmpId = `trailmap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const pdfPath = path.join(os.tmpdir(), `${tmpId}.pdf`);
  const outPrefix = path.join(os.tmpdir(), tmpId);

  try {
    fs.writeFileSync(pdfPath, pdfBuffer);
    execSync(`pdftoppm -jpeg -r 300 -f ${pg} -l ${pg} "${pdfPath}" "${outPrefix}"`, { timeout: 30_000 });

    // pdftoppm outputs {prefix}-{pageNum}.jpg
    const outPath = outPrefix + `-${pg}.jpg`;
    if (!fs.existsSync(outPath)) throw new Error('pdftoppm produced no output');

    const imageData = fs.readFileSync(outPath);
    fs.unlinkSync(outPath);
    log(`[trailmap] PDF converted: ${(imageData.length / 1024 / 1024).toFixed(1)}MB JPEG`);
    return { data: imageData, contentType: 'image/jpeg' };
  } finally {
    try { fs.unlinkSync(pdfPath); } catch (_) {}
  }
}

async function discoverTrailMapUrl(slug) {
  if (slug === 'alta') return ALTA_TRAILMAP_URL;
  if (slug === 'snowbird') return SNOWBIRD_TRAILMAP_URL;
  if (TERRAIN_URLS[slug]) {
    // Try scene7 image first, then direct image override, then PDF fallback
    const imageUrl = await discoverVailTrailMapUrl(slug);
    if (imageUrl) return imageUrl;
    if (IMAGE_TRAIL_MAP_OVERRIDES[slug]) return IMAGE_TRAIL_MAP_OVERRIDES[slug];
    if (PDF_TRAIL_MAP_OVERRIDES[slug]) return PDF_TRAIL_MAP_OVERRIDES[slug];
  }
  return null;
}

async function getTrailMapImage(slug) {
  const entry = trailMapCache[slug];
  const now = Date.now();

  // Mark as recently requested
  if (entry) entry.lastRequestedAt = now;

  // Cache hit — data is fresh
  if (entry && entry.data && (now - entry.fetchedAt) < TRAILMAP_CACHE_TTL_MS) {
    return { data: entry.data, contentType: entry.contentType };
  }

  // If a fetch is already in flight, wait for it
  if (entry && entry.fetching) {
    const deadline = now + 45_000;
    while (trailMapCache[slug] && trailMapCache[slug].fetching && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }
    const updated = trailMapCache[slug];
    return updated && updated.data ? { data: updated.data, contentType: updated.contentType } : null;
  }

  // Start a new fetch
  if (!trailMapCache[slug]) {
    trailMapCache[slug] = { data: null, contentType: null, fetchedAt: 0, lastRequestedAt: now, fetching: false };
  }
  trailMapCache[slug].fetching = true;

  try {
    const imageUrl = await discoverTrailMapUrl(slug);
    if (!imageUrl) {
      log(`[trailmap:${slug}] No trail map source found`);
      return null;
    }

    // PDF URLs get converted to JPEG via pdftoppm; images fetched directly
    const isPdf = imageUrl.toLowerCase().endsWith('.pdf');
    let { data, contentType } = isPdf
      ? await renderPdfAsImage(imageUrl, PDF_PAGE_OVERRIDES[slug])
      : await fetchImageBuffer(imageUrl);

    // Crop brochure-style images to keep only the trail map portion
    const cropPct = TRAIL_MAP_CROP_PCT[slug];
    if (cropPct) {
      const tmpIn = path.join(os.tmpdir(), `crop-in-${Date.now()}.jpg`);
      const tmpOut = path.join(os.tmpdir(), `crop-out-${Date.now()}.jpg`);
      try {
        fs.writeFileSync(tmpIn, data);
        execSync(`convert "${tmpIn}" -gravity North -crop 100%x${cropPct}%+0+0 +repage "${tmpOut}"`, { timeout: 15_000 });
        data = fs.readFileSync(tmpOut);
        contentType = 'image/jpeg';
        log(`[trailmap:${slug}] Cropped to top ${cropPct}%: ${(data.length / 1024 / 1024).toFixed(1)}MB`);
      } finally {
        try { fs.unlinkSync(tmpIn); } catch (_) {}
        try { fs.unlinkSync(tmpOut); } catch (_) {}
      }
    }

    trailMapCache[slug].data = data;
    trailMapCache[slug].contentType = contentType;
    trailMapCache[slug].fetchedAt = Date.now();
    log(`[trailmap:${slug}] Cached ${(data.length / 1024 / 1024).toFixed(1)}MB image`);
    return { data, contentType };
  } catch (e) {
    log(`[trailmap:${slug}] Fetch failed: ${e.message}`);
    return trailMapCache[slug].data ? { data: trailMapCache[slug].data, contentType: trailMapCache[slug].contentType } : null;
  } finally {
    trailMapCache[slug].fetching = false;
  }
}

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

  // --- /alta ---
  if (path === '/alta') {
    try {
      const data = await getAltaData();
      res.end(JSON.stringify(data));
    } catch (e) {
      log(`[alta] Request error: ${e.message}`);
      res.statusCode = 503;
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // --- /trailmap/{slug} ---
  const trailmapMatch = path.match(/^\/trailmap\/([a-z]+)$/);
  if (trailmapMatch) {
    const tmSlug = trailmapMatch[1];
    try {
      const result = await getTrailMapImage(tmSlug);
      if (!result) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: `No trail map available for: ${tmSlug}` }));
        return;
      }
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.end(result.data);
    } catch (e) {
      log(`[trailmap:${tmSlug}] Request error: ${e.message}`);
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Trail map fetch failed' }));
    }
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
