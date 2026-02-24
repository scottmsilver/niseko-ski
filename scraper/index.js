const puppeteer = require('puppeteer');
const https = require('https');
const http = require('http');
const { execFile } = require('child_process');

function execFileAsync(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });
}
const fs = require('fs');
const path = require('path');
const SHARED = require('./shared-constants.json');
const JP_EN_WEATHER = SHARED.JP_EN_WEATHER;
const RESORT_TIMEZONES = SHARED.RESORT_TIMEZONES;
const VAIL_STATUS_MAP = SHARED.VAIL_STATUS_MAP;
const NISEKO_STATUS_MAP = SHARED.NISEKO_STATUS_MAP;
const os = require('os');

// ---------------------------------------------------------------------------
// Response size limits (C2)
// ---------------------------------------------------------------------------
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;       // 5 MB for JSON/HTML
const MAX_IMAGE_RESPONSE_BYTES = 50 * 1024 * 1024; // 50 MB for images

// ---------------------------------------------------------------------------
// SSRF prevention: validate redirect destinations (C1)
// ---------------------------------------------------------------------------
function isPrivateHostname(hostname) {
  // IPv6 loopback
  if (hostname === '::1' || hostname === '[::1]') return true;
  // IPv6 unique-local (fc00::/7)
  if (/^\[?f[cd]/i.test(hostname)) return true;
  // IPv4 private/reserved ranges
  const parts = hostname.replace(/^\[|\]$/g, '').split('.');
  if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) {
    const a = parseInt(parts[0], 10);
    const b = parseInt(parts[1], 10);
    if (a === 127) return true;                         // 127.0.0.0/8
    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
    if (a === 192 && b === 168) return true;            // 192.168.0.0/16
    if (a === 169 && b === 254) return true;            // 169.254.0.0/16
    if (a === 0) return true;                            // 0.0.0.0/8
  }
  // localhost alias
  if (hostname === 'localhost') return true;
  return false;
}

function isAllowedRedirect(locationUrl, originalUrl) {
  try {
    const resolved = new URL(locationUrl, originalUrl);
    // Reject protocol downgrade (HTTPS -> HTTP)
    if (new URL(originalUrl).protocol === 'https:' && resolved.protocol !== 'https:') return false;
    // Reject private/internal IPs
    if (isPrivateHostname(resolved.hostname)) return false;
    return true;
  } catch (_) {
    return false;
  }
}

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
const TRAILMAP_MAX_ENTRIES = 10;                   // cap in-memory trail map images
const WEATHER_CACHE_TTL_MS = 5 * 60_000;          // 5 minutes for weather
const PORT = 3000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// Per-resort cache: { data, fetchedAt, lastRequestedAt, scraping: bool }
const cache = {};

// Trail map image cache: { [slug]: { data: Buffer, contentType, fetchedAt, lastRequestedAt, fetching } }
const trailMapCache = {};

// Weather cache: { [slug]: { data, fetchedAt, lastRequestedAt, fetching } }
const weatherCache = {};

// Concurrency limiter for Puppeteer pages
const MAX_CONCURRENT_SCRAPES = 3;
let activeScrapes = 0;

// Shared browser instance (reused across scrapes)
let browser = null;
let browserLaunching = false;
let browserLaunchPromise = null;
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
  if (browserLaunching && browserLaunchPromise) {
    await browserLaunchPromise;
    if (browser && browser.isConnected()) return browser;
    throw new Error('Browser launch failed (waited)');
  }

  browserLaunching = true;
  let resolveLaunch;
  browserLaunchPromise = new Promise(r => { resolveLaunch = r; });
  try {
    log('Launching browser');
    browser = await puppeteer.launch({
      headless: true,
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
    resolveLaunch();
    browserLaunchPromise = null;
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
  if (entry && entry.scraping && entry.promise) {
    await entry.promise;
    const updated = cache[slug];
    return updated && updated.data ? updated.data : null;
  }

  // Start a new scrape
  if (!cache[slug]) {
    cache[slug] = { data: null, fetchedAt: 0, lastRequestedAt: now, scraping: false, promise: null };
  }
  cache[slug].scraping = true;
  let resolve;
  cache[slug].promise = new Promise(r => { resolve = r; });

  try {
    const data = await scrapeResort(slug);
    if (data) {
      cache[slug].data = data;
      cache[slug].fetchedAt = Date.now();
    }
    return cache[slug].data; // may still be previous stale data if scrape returned null
  } finally {
    cache[slug].scraping = false;
    resolve();
    cache[slug].promise = null;
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
  // Weather cache cleanup
  for (const slug of Object.keys(weatherCache)) {
    if (weatherCache[slug].fetching) continue;
    if (now - weatherCache[slug].lastRequestedAt > STALE_DROP_MS) {
      log(`[weather:${slug}] Dropping from cache (idle ${Math.round((now - weatherCache[slug].lastRequestedAt) / 1000)}s)`);
      delete weatherCache[slug];
    }
  }
  // Alta cache cleanup (M3)
  if (altaCache.data && !altaCache.fetching && (now - altaCache.fetchedAt) > CACHE_TTL_MS) {
    log('[alta] Dropping from cache (stale)');
    altaCache = { data: null, fetchedAt: 0, fetching: false };
  }
  // Snowbird cache cleanup
  if (snowbirdCache.data && !snowbirdCache.fetching && (now - snowbirdCache.fetchedAt) > SNOWBIRD_CACHE_TTL_MS) {
    log('[snowbird] Dropping from cache (stale)');
    snowbirdCache = { data: null, fetchedAt: 0, fetching: false };
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
      let totalBytes = 0;
      res.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_RESPONSE_BYTES) { res.destroy(new Error('Response too large')); return; }
        chunks.push(chunk);
      });
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
  if (altaCache.fetching && altaCache.promise) {
    await altaCache.promise;
    if (altaCache.data) return altaCache.data;
  }

  altaCache.fetching = true;
  let resolveAlta;
  altaCache.promise = new Promise(r => { resolveAlta = r; });
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
    resolveAlta();
    altaCache.promise = null;
  }
}

// ---------------------------------------------------------------------------
// Snowbird: lightweight API fetch with caching (M2)
// ---------------------------------------------------------------------------
const SNOWBIRD_CACHE_TTL_MS = 120000;
let snowbirdCache = { data: null, fetchedAt: 0, fetching: false };

function fetchSnowbirdLifts() {
  return new Promise((resolve, reject) => {
    const req = https.get('https://api.snowbird.com/api/v1/dor/drupal/lifts', { headers: { Accept: 'application/json' } }, (r) => {
      if (r.statusCode !== 200) {
        r.resume();
        return reject(new Error(`Snowbird HTTP ${r.statusCode}`));
      }
      const chunks = [];
      let totalBytes = 0;
      r.on('data', c => {
        totalBytes += c.length;
        if (totalBytes > MAX_RESPONSE_BYTES) { r.destroy(new Error('Response too large')); return; }
        chunks.push(c);
      });
      r.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('Timeout')); });
  });
}

async function getSnowbirdData() {
  const now = Date.now();
  if (snowbirdCache.data && (now - snowbirdCache.fetchedAt) < SNOWBIRD_CACHE_TTL_MS) {
    return snowbirdCache.data;
  }

  // If another fetch is in flight, wait for it
  if (snowbirdCache.fetching && snowbirdCache.promise) {
    await snowbirdCache.promise;
    if (snowbirdCache.data) return snowbirdCache.data;
  }

  snowbirdCache.fetching = true;
  let resolveSnowbird;
  snowbirdCache.promise = new Promise(r => { resolveSnowbird = r; });
  try {
    const data = await fetchSnowbirdLifts();
    snowbirdCache.data = data;
    snowbirdCache.fetchedAt = Date.now();
    log(`[snowbird] Fetched ${(data || []).length} lifts`);
    return data;
  } finally {
    snowbirdCache.fetching = false;
    resolveSnowbird();
    snowbirdCache.promise = null;
  }
}

// ---------------------------------------------------------------------------
// Generic HTTPS fetch helpers
// ---------------------------------------------------------------------------
function fetchImageBuffer(url, _redirects = 0) {
  return new Promise((resolve, reject) => {
    if (_redirects > 5) return reject(new Error('Too many redirects'));
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (!isAllowedRedirect(res.headers.location, url)) return reject(new Error('Blocked redirect'));
        const resolved = new URL(res.headers.location, url).href;
        return fetchImageBuffer(resolved, _redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const contentType = (res.headers['content-type'] || 'image/jpeg').split(';')[0].trim();
      const chunks = [];
      let totalBytes = 0;
      res.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_IMAGE_RESPONSE_BYTES) { res.destroy(new Error('Response too large')); return; }
        chunks.push(chunk);
      });
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
function fetchRawBuffer(url, _redirects = 0) {
  return new Promise((resolve, reject) => {
    if (_redirects > 5) return reject(new Error('Too many redirects'));
    const req = https.get(url, { headers: { 'User-Agent': 'curl/8.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (!isAllowedRedirect(res.headers.location, url)) return reject(new Error('Blocked redirect'));
        const resolved = new URL(res.headers.location, url).href;
        return fetchRawBuffer(resolved, _redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      let totalBytes = 0;
      res.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_IMAGE_RESPONSE_BYTES) { res.destroy(new Error('Response too large')); return; }
        chunks.push(chunk);
      });
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
    await execFileAsync('pdftoppm', ['-jpeg', '-r', '300', '-f', String(pg), '-l', String(pg), pdfPath, outPrefix], { timeout: 30_000 });

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
  if (entry && entry.fetching && entry.promise) {
    await entry.promise;
    const updated = trailMapCache[slug];
    return updated && updated.data ? { data: updated.data, contentType: updated.contentType } : null;
  }

  // Start a new fetch
  if (!trailMapCache[slug]) {
    trailMapCache[slug] = { data: null, contentType: null, fetchedAt: 0, lastRequestedAt: now, fetching: false, promise: null };
  }
  trailMapCache[slug].fetching = true;
  let resolveTM;
  trailMapCache[slug].promise = new Promise(r => { resolveTM = r; });

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
        await execFileAsync('convert', [tmpIn, '-gravity', 'North', '-crop', `100%x${cropPct}%+0+0`, '+repage', tmpOut], { timeout: 15_000 });
        data = fs.readFileSync(tmpOut);
        contentType = 'image/jpeg';
        log(`[trailmap:${slug}] Cropped to top ${cropPct}%: ${(data.length / 1024 / 1024).toFixed(1)}MB`);
      } finally {
        try { fs.unlinkSync(tmpIn); } catch (_) {}
        try { fs.unlinkSync(tmpOut); } catch (_) {}
      }
    }

    // Evict oldest entry if cache is at capacity
    const keys = Object.keys(trailMapCache);
    if (keys.length > TRAILMAP_MAX_ENTRIES) {
      let oldest = null, oldestAt = Infinity;
      for (const k of keys) {
        if (k === slug || trailMapCache[k].fetching) continue;
        if (trailMapCache[k].lastRequestedAt < oldestAt) { oldest = k; oldestAt = trailMapCache[k].lastRequestedAt; }
      }
      if (oldest) { log(`[trailmap:${oldest}] Evicted (cache full)`); delete trailMapCache[oldest]; }
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
    resolveTM();
    trailMapCache[slug].promise = null;
  }
}

// ---------------------------------------------------------------------------
// Display computation: normalize raw data + augment with display instructions
// ---------------------------------------------------------------------------
const { augmentDisplay } = require('./display');

// RESORT_TIMEZONES — loaded from shared-constants.json (canonical source)

// VAIL_STATUS_MAP — loaded from shared-constants.json (canonical source)

// Normalize raw Vail TerrainStatusFeed into the shared format
function normalizeVailData(slug, raw) {
  const timezone = RESORT_TIMEZONES[slug] || 'America/Denver';
  const areas = {};
  for (const lift of (raw.Lifts || [])) {
    const area = lift.Mountain || slug;
    if (!areas[area]) areas[area] = [];
    const status = VAIL_STATUS_MAP[lift.Status] || 'CLOSED';
    areas[area].push({
      id: lift.Name, name: lift.Name,
      status,
      scheduled: lift.Status === 'Scheduled',
      start_time: (lift.OpenTime && lift.OpenTime !== 'null') ? lift.OpenTime : null,
      end_time: (lift.CloseTime && lift.CloseTime !== 'null') ? lift.CloseTime : null,
      waitMinutes: lift.WaitTimeInMinutes != null ? lift.WaitTimeInMinutes : null,
      updateDate: null,
      liftType: lift.Type || null,
      capacity: lift.Capacity || null,
    });
  }
  const subResorts = Object.entries(areas).map(([name, lifts]) => ({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name, lifts,
  }));
  return augmentDisplay(subResorts, timezone);
}

// Normalize raw Alta data into the shared format
function normalizeAltaData(raw) {
  const lifts = (raw.lifts || []).map(lift => ({
    id: lift.name, name: lift.name,
    status: lift.open ? 'OPERATING' : 'CLOSED',
    scheduled: !lift.open && lift.opening_at != null,
    start_time: lift.opening_at || null,
    end_time: lift.closing_at || null,
    waitMinutes: null,
    updateDate: null,
  }));
  const subResorts = [{ id: 'alta', name: 'Alta', lifts }];
  return augmentDisplay(subResorts, 'America/Denver');
}

// Normalize raw Snowbird lifts array
function normalizeSnowbirdData(raw) {
  const SNOWBIRD_STATUS = { open: 'OPERATING', expected: 'CLOSED', closed: 'CLOSED' };
  function to24Local(s) {
    const m = s.match(/(\d+)(?::(\d+))?\s*(AM|PM)/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = m[2] || '00';
    const ampm = m[3].toUpperCase();
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return String(h).padStart(2, '0') + ':' + min;
  }

  const areas = {};
  for (const lift of (raw || [])) {
    const area = (lift.sector && lift.sector.name) || 'Snowbird';
    if (!areas[area]) areas[area] = [];
    const status = SNOWBIRD_STATUS[lift.status] || 'CLOSED';
    let start = null, end = null;
    if (lift.hours) {
      const m = lift.hours.trim().match(/^([\d:]+\s*[AP]M)\s*-\s*([\d:]+\s*[AP]M)$/i);
      if (m) { start = to24Local(m[1]); end = to24Local(m[2]); }
    }
    areas[area].push({
      id: lift.name, name: lift.name,
      status,
      scheduled: lift.status === 'expected',
      start_time: start, end_time: end,
      waitMinutes: null, updateDate: null,
    });
  }
  const subResorts = Object.entries(areas).map(([name, lifts]) => ({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name, lifts,
  }));
  return augmentDisplay(subResorts, 'America/Denver');
}

// Normalize raw Niseko (yukiyama) data into shared format
const NISEKO_SUB_RESORTS = [
  { id: '379', name: 'Hanazono' },
  { id: '390', name: 'Grand Hirafu' },
  { id: '393', name: 'Annupuri' },
  { id: '394', name: 'Niseko Village' },
];
// NISEKO_STATUS_MAP — loaded from shared-constants.json (canonical source)

function fetchNisekoLifts(skiareaId) {
  return new Promise((resolve, reject) => {
    const url = `https://web-api.yukiyama.biz/web-api/latest-facility/backward?facilityType=lift&lang=en&skiareaId=${skiareaId}`;
    const req = https.get(url, { headers: { Accept: 'application/json', Referer: 'https://www.niseko.ne.jp/' } }, (r) => {
      if (r.statusCode !== 200) {
        r.resume();
        return reject(new Error(`Niseko lifts HTTP ${r.statusCode}`));
      }
      const chunks = [];
      let totalBytes = 0;
      r.on('data', c => {
        totalBytes += c.length;
        if (totalBytes > MAX_RESPONSE_BYTES) { r.destroy(new Error('Response too large')); return; }
        chunks.push(c);
      });
      r.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('Timeout')); });
  });
}

async function normalizeNisekoData() {
  const results = await Promise.all(NISEKO_SUB_RESORTS.map(async (r) => {
    try {
      const data = await fetchNisekoLifts(r.id);
      const lifts = (data.results || []).map(l => ({
        id: l.id, name: l.name,
        status: NISEKO_STATUS_MAP[l.status] || l.status,
        scheduled: false,
        start_time: l.start_time || null,
        end_time: l.end_time || null,
        waitMinutes: null,
        updateDate: l.updateDate || null,
        comment: l.comment || null,
      }));
      return { id: r.id, name: r.name, lifts };
    } catch (_) {
      return { id: r.id, name: r.name, lifts: null };
    }
  }));
  return augmentDisplay(results, 'Asia/Tokyo');
}

// ---------------------------------------------------------------------------
// Weather normalization — server-vended weather stations
// ---------------------------------------------------------------------------

// JP_EN_WEATHER — loaded from shared-constants.json (canonical source)

function trJP(s) { return s ? (JP_EN_WEATHER[s] || s) : '\u2014'; }

function wxIcon(weather) {
  const w = (weather || '').toLowerCase();
  if (w.includes('storm') || w.includes('blizzard')) return '\u{1F32C}\u{FE0F}';
  if (w.includes('snow')) return '\u{2744}\u{FE0F}';
  if (w.includes('rain')) return '\u{1F327}\u{FE0F}';
  if (w.includes('cloud') || w.includes('overcast')) return '\u{2601}\u{FE0F}';
  if (w.includes('sun') || w.includes('clear') || w.includes('fine')) return '\u{2600}\u{FE0F}';
  if (w.includes('fog') || w.includes('mist')) return '\u{1F32B}\u{FE0F}';
  return '\u{1F324}\u{FE0F}';
}

function cToF(c) { return Math.round(c * 9 / 5 + 32); }
function cmToIn(cm) { return (cm / 2.54).toFixed(1); }

function formatSnow(cm) {
  if (cm == null || isNaN(cm)) return '\u2014';
  return `${cmToIn(cm)}" (${Math.round(cm)}cm)`;
}

function makeStation(label, s) {
  const weather = trJP(s.weather);
  return {
    label,
    tempF: s.temperature != null ? `${cToF(s.temperature)}\u00B0F` : '\u2014',
    tempC: s.temperature != null ? `${Math.round(s.temperature)}\u00B0C` : '\u2014',
    weather,
    icon: wxIcon(weather),
    snowDisplay: formatSnow(s.snow_accumulation),
    snow24hDisplay: formatSnow(s.snow_accumulation_difference),
    snowState: trJP(s.snow_state),
    wind: s.wind_speed || '\u2014',
    courses: trJP(s.cource_state),
  };
}

function fetchNisekoWeatherRaw(skiareaId) {
  return new Promise((resolve, reject) => {
    const url = `https://web-api.yukiyama.biz/web-api/latest-weather/backward?lang=en&skiareaId=${skiareaId}`;
    const req = https.get(url, { headers: { Accept: 'application/json', Referer: 'https://www.niseko.ne.jp/' } }, (r) => {
      if (r.statusCode !== 200) {
        r.resume();
        return reject(new Error(`Niseko weather HTTP ${r.statusCode}`));
      }
      const chunks = [];
      let totalBytes = 0;
      r.on('data', c => {
        totalBytes += c.length;
        if (totalBytes > MAX_RESPONSE_BYTES) { r.destroy(new Error('Response too large')); return; }
        chunks.push(c);
      });
      r.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('Timeout')); });
  });
}

async function normalizeNisekoWeather() {
  return Promise.all(NISEKO_SUB_RESORTS.map(async (r) => {
    try {
      const data = await fetchNisekoWeatherRaw(r.id);
      const raw = data.results || [];
      if (raw.length === 0) return { id: r.id, name: r.name, stations: [] };

      if (raw.length === 1) {
        return { id: r.id, name: r.name, stations: [makeStation('Conditions', raw[0])] };
      }

      const summit = raw.find(w => /top|peak|summit/i.test(w.name)) || raw[0];
      const base = raw.find(w => /base|foot/i.test(w.name)) || raw[raw.length - 1];
      return { id: r.id, name: r.name, stations: [makeStation('Summit', summit), makeStation('Base', base)] };
    } catch (e) {
      log(`[weather:niseko:${r.id}] Fetch failed: ${e.message}`);
      return { id: r.id, name: r.name, stations: [] };
    }
  }));
}

function fetchVailWeatherRaw(slug) {
  return new Promise((resolve, reject) => {
    const req = https.get(`https://cache.snow.com/api/WeatherApi/GetWeather/${slug}`, { headers: { Accept: 'application/json' } }, (r) => {
      if (r.statusCode !== 200) {
        r.resume();
        return reject(new Error(`Vail weather HTTP ${r.statusCode}`));
      }
      const chunks = [];
      let totalBytes = 0;
      r.on('data', c => {
        totalBytes += c.length;
        if (totalBytes > MAX_RESPONSE_BYTES) { r.destroy(new Error('Response too large')); return; }
        chunks.push(c);
      });
      r.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('Timeout')); });
  });
}

function normalizeVailWeather(slug, raw) {
  const baseSnow = raw.BaseSnowReadings;
  const midMountain = baseSnow && baseSnow.MidMountain;
  const newSnow = raw.NewSnowReadings;
  const newSnow24 = newSnow && newSnow.TwentyFourHours;
  const runs = raw.Runs;
  const snowConditions = raw.SnowConditions || '';

  const snowCm = midMountain ? parseInt(midMountain.Centimeters, 10) : null;
  const new24Cm = newSnow24 ? parseInt(newSnow24.Centimeters, 10) : null;
  const runsOpen = runs ? (runs.Open || 0) : 0;
  const runsTotal = runs ? (runs.Total || 0) : 0;

  const station = {
    label: 'Conditions',
    tempF: '\u2014',
    tempC: '\u2014',
    weather: snowConditions || '\u2014',
    icon: wxIcon(snowConditions),
    snowDisplay: formatSnow(isNaN(snowCm) ? null : snowCm),
    snow24hDisplay: formatSnow(isNaN(new24Cm) ? null : new24Cm),
    snowState: snowConditions || '\u2014',
    wind: '\u2014',
    courses: `${runsOpen} / ${runsTotal} runs`,
  };

  return [{ id: slug, name: slug, stations: [station] }];
}

async function getWeatherData(slug) {
  if (slug !== 'niseko' && slug !== 'alta' && slug !== 'snowbird' && !TERRAIN_URLS[slug]) {
    return null;
  }

  const entry = weatherCache[slug];
  const now = Date.now();
  if (entry) entry.lastRequestedAt = now;

  if (entry && entry.data && (now - entry.fetchedAt) < WEATHER_CACHE_TTL_MS) {
    return entry.data;
  }

  if (entry && entry.fetching && entry.promise) {
    await entry.promise;
    const updated = weatherCache[slug];
    return updated && updated.data ? updated.data : { subResorts: [] };
  }

  if (!weatherCache[slug]) {
    weatherCache[slug] = { data: null, fetchedAt: 0, lastRequestedAt: now, fetching: false, promise: null };
  }
  weatherCache[slug].fetching = true;
  let resolveWx;
  weatherCache[slug].promise = new Promise(r => { resolveWx = r; });

  try {
    let subResorts;
    if (slug === 'niseko') {
      subResorts = await normalizeNisekoWeather();
    } else if (slug === 'alta' || slug === 'snowbird') {
      subResorts = [];
    } else if (TERRAIN_URLS[slug]) {
      const raw = await fetchVailWeatherRaw(slug);
      subResorts = normalizeVailWeather(slug, raw);
    } else {
      return null;
    }
    const result = { subResorts };
    weatherCache[slug].data = result;
    weatherCache[slug].fetchedAt = Date.now();
    log(`[weather:${slug}] Cached weather for ${subResorts.length} sub-resort(s)`);
    return result;
  } catch (e) {
    log(`[weather:${slug}] Fetch failed: ${e.message}`);
    return weatherCache[slug].data || { subResorts: [] };
  } finally {
    weatherCache[slug].fetching = false;
    resolveWx();
    weatherCache[slug].promise = null;
  }
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  const urlPath = req.url.replace(/\/$/, '') || '/';

  // --- /health ---
  if (urlPath === '/health') {
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
  if (urlPath === '/resorts') {
    res.end(JSON.stringify(Object.keys(TERRAIN_URLS)));
    return;
  }

  // --- /display/{slug} --- normalized lift data with display instructions
  const displayMatch = urlPath.match(/^\/display\/([a-z]+)$/);
  if (displayMatch) {
    const dSlug = displayMatch[1];
    try {
      let subResorts;
      if (dSlug === 'niseko') {
        subResorts = await normalizeNisekoData();
      } else if (dSlug === 'alta') {
        const data = await getAltaData();
        subResorts = normalizeAltaData(data);
      } else if (dSlug === 'snowbird') {
        const snowbirdRes = await getSnowbirdData();
        subResorts = normalizeSnowbirdData(snowbirdRes);
      } else if (TERRAIN_URLS[dSlug]) {
        const data = await getResortData(dSlug);
        if (!data) {
          res.statusCode = 503;
          res.end(JSON.stringify({ error: 'No data yet' }));
          return;
        }
        subResorts = normalizeVailData(dSlug, data);
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: `Unknown resort: ${dSlug}` }));
        return;
      }
      res.end(JSON.stringify({ subResorts }));
    } catch (e) {
      log(`[display:${dSlug}] Error: ${e.message}`);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal error' }));
    }
    return;
  }

  // --- /weather/{slug} --- normalized weather data with display strings
  const weatherMatch = urlPath.match(/^\/weather\/([a-z]+)$/);
  if (weatherMatch) {
    const wSlug = weatherMatch[1];
    try {
      const result = await getWeatherData(wSlug);
      if (!result) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: `Unknown resort: ${wSlug}` }));
        return;
      }
      res.end(JSON.stringify(result));
    } catch (e) {
      log(`[weather:${wSlug}] Error: ${e.message}`);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal error' }));
    }
    return;
  }

  // --- /alta ---
  if (urlPath === '/alta') {
    try {
      const data = await getAltaData();
      res.end(JSON.stringify(data));
    } catch (e) {
      log(`[alta] Request error: ${e.message}`);
      res.statusCode = 503;
      res.end(JSON.stringify({ error: 'Service temporarily unavailable' }));
    }
    return;
  }

  // --- /trailmap/{slug} ---
  const trailmapMatch = urlPath.match(/^\/trailmap\/([a-z]+)$/);
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
  const slug = urlPath.slice(1); // strip leading /
  if (!/^[a-z]+$/.test(slug)) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }
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
