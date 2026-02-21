// Load GeoJSON data
let LIFT_GEOJSON, RUN_GEOJSON;

async function loadGeoJSON() {
  try {
    const [liftsRes, runsRes] = await Promise.all([
      fetch('data/lifts.geojson'),
      fetch('data/runs.geojson'),
    ]);
    if (!liftsRes.ok || !runsRes.ok) throw new Error('GeoJSON fetch failed');
    LIFT_GEOJSON = await liftsRes.json();
    RUN_GEOJSON = await runsRes.json();
  } catch (e) {
    console.error('Failed to load GeoJSON:', e);
    LIFT_GEOJSON = { type: 'FeatureCollection', features: [] };
    RUN_GEOJSON = { type: 'FeatureCollection', features: [] };
  }
}

const API_BASE = 'https://web-api.yukiyama.biz/web-api';
const REFERER = 'https://www.niseko.ne.jp/';
const REFRESH_INTERVAL_MS = 120000;
const CHANGE_WINDOW_MS = 600000;
const CHANGE_HIGHLIGHT_MS = 30000;
const WHEEL_ZOOM_IN = 1.15;
const WHEEL_ZOOM_OUT = 0.87;
const KM_PER_DEGREE = 111;

const RESORTS = [
  { id: '379', name: 'Hanazono' },
  { id: '390', name: 'Grand Hirafu' },
  { id: '393', name: 'Annupuri' },
  { id: '394', name: 'Niseko Village' },
];

let previousData = {};
let latestData = {};
let lastRenderedHash = '';
let changeLog = [];
let refreshTimer = null;
let fetchCount = 0;

// --- Theme & Font Settings ---
const THEMES = [
  { name: 'light', label: 'Light', bg: '#f5f5f7', accent: '#e85d75' },
  { name: 'dark', label: 'Dark', bg: '#1a1a2e', accent: '#ff6b9d' },
  { name: 'powder', label: 'Powder', bg: '#0b1628', accent: '#5cb8ff' },
  { name: 'sakura', label: 'Sakura', bg: '#1e0a14', accent: '#ff85a2' },
  { name: 'sunset', label: 'Sunset', bg: '#1a0f05', accent: '#ff8c42' },
];

const FONT_SCALES = [
  { label: 'Default', scale: 1 },
  { label: 'Large', scale: 1.15 },
  { label: 'Extra Large', scale: 1.3 },
  { label: 'Huge', scale: 1.5 },
];

let currentTheme = localStorage.getItem('niseko-theme') || 'light';
let currentFontScale = parseFloat(localStorage.getItem('niseko-font-scale')) || 1;

function applyTheme(name) {
  currentTheme = name;
  if (name === 'light') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', name);
  }
  localStorage.setItem('niseko-theme', name);

  // Update meta theme-color
  const theme = THEMES.find(t => t.name === name);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && theme) meta.content = theme.bg;
}

function applyFontScale(scale) {
  currentFontScale = scale;
  document.documentElement.style.setProperty('--font-scale', scale);
  localStorage.setItem('niseko-font-scale', String(scale));
}

function renderSettings() {
  const picker = document.getElementById('theme-picker');
  picker.innerHTML = '';
  THEMES.forEach(t => {
    const swatch = document.createElement('div');
    swatch.className = 'theme-swatch' + (currentTheme === t.name ? ' selected' : '');
    swatch.dataset.theme = t.name;

    const circle = document.createElement('div');
    circle.className = 'swatch-circle';
    circle.style.background = t.bg;
    const dot = document.createElement('div');
    dot.className = 'swatch-dot';
    dot.style.background = t.accent;
    circle.appendChild(dot);

    const label = document.createElement('span');
    label.className = 'swatch-label';
    label.textContent = t.label;

    swatch.appendChild(circle);
    swatch.appendChild(label);
    swatch.addEventListener('click', () => {
      applyTheme(t.name);
      renderSettings();
    });
    picker.appendChild(swatch);
  });

  const fontContainer = document.getElementById('font-options');
  fontContainer.innerHTML = '';
  FONT_SCALES.forEach(f => {
    const opt = document.createElement('div');
    opt.className = 'font-option' + (currentFontScale === f.scale ? ' selected' : '');
    opt.dataset.scale = f.scale;
    opt.textContent = f.label;
    opt.addEventListener('click', () => {
      applyFontScale(f.scale);
      renderSettings();
    });
    fontContainer.appendChild(opt);
  });
}

// --- Tab Switching ---
let mapInit = false;
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'map' && !mapInit) {
      mapInit = true;
      initMap();
    }
    if (btn.dataset.tab === 'trail' && !trailMapInit) {
      trailMapInit = true;
      initTrailMap();
    }
  });
});

// Trail Map - pinch-zoom & pan
let trailMapInit = false;
function initTrailMap() {
  const container = document.getElementById('trail-map-container');
  const img = document.getElementById('trail-map-img');
  const loading = document.getElementById('trail-map-loading');

  let scale = 1, minScale = 0.1, maxScale = 8;
  let tx = 0, ty = 0;
  let isDragging = false, startX, startY, startTx, startTy;
  let lastTouchDist = 0, lastTouchMid = null;

  function applyTransform() {
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  function fitToContainer() {
    const cw = container.clientWidth, ch = container.clientHeight;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih) return;
    scale = Math.min(cw / iw, ch / ih);
    minScale = scale * 0.5;
    tx = (cw - iw * scale) / 2;
    ty = (ch - ih * scale) / 2;
    applyTransform();
  }

  function zoomAt(cx, cy, factor) {
    const newScale = Math.min(maxScale, Math.max(minScale, scale * factor));
    const ratio = newScale / scale;
    tx = cx - (cx - tx) * ratio;
    ty = cy - (cy - ty) * ratio;
    scale = newScale;
    applyTransform();
    saveTrailState();
  }

  function saveTrailState() {
    localStorage.setItem('niseko-trail-state', JSON.stringify({ scale, tx, ty }));
  }

  function loadTrailState() {
    try {
      const saved = JSON.parse(localStorage.getItem('niseko-trail-state'));
      if (saved && saved.scale > 0) return saved;
    } catch (e) {}
    return null;
  }

  img.src = 'trail-map.jpg';
  img.onload = () => {
    loading.style.display = 'none';
    const saved = loadTrailState();
    if (saved) {
      scale = saved.scale;
      tx = saved.tx;
      ty = saved.ty;
      minScale = Math.min(container.clientWidth / img.naturalWidth, container.clientHeight / img.naturalHeight) * 0.5;
      applyTransform();
    } else {
      fitToContainer();
    }
  };
  img.onerror = () => { loading.textContent = 'Failed to load trail map'; };

  // Mouse wheel zoom
  container.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? WHEEL_ZOOM_IN : WHEEL_ZOOM_OUT);
  }, { passive: false });

  // Mouse drag
  container.addEventListener('mousedown', e => {
    isDragging = true; startX = e.clientX; startY = e.clientY;
    startTx = tx; startTy = ty;
  });
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    tx = startTx + (e.clientX - startX);
    ty = startTy + (e.clientY - startY);
    applyTransform();
  });
  window.addEventListener('mouseup', () => { if (isDragging) saveTrailState(); isDragging = false; });

  // Touch pinch-zoom & pan
  function touchDist(t) {
    const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
    return Math.hypot(dx, dy);
  }
  function touchMid(t, rect) {
    return { x: (t[0].clientX + t[1].clientX) / 2 - rect.left,
             y: (t[0].clientY + t[1].clientY) / 2 - rect.top };
  }

  container.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      isDragging = true;
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      startTx = tx; startTy = ty;
    } else if (e.touches.length === 2) {
      isDragging = false;
      lastTouchDist = touchDist(e.touches);
      lastTouchMid = touchMid(e.touches, container.getBoundingClientRect());
    }
  }, { passive: true });

  container.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && isDragging) {
      tx = startTx + (e.touches[0].clientX - startX);
      ty = startTy + (e.touches[0].clientY - startY);
      applyTransform();
    } else if (e.touches.length === 2) {
      const dist = touchDist(e.touches);
      const rect = container.getBoundingClientRect();
      const mid = touchMid(e.touches, rect);
      if (lastTouchDist) {
        zoomAt(mid.x, mid.y, dist / lastTouchDist);
      }
      lastTouchDist = dist;
      lastTouchMid = mid;
    }
  }, { passive: false });

  container.addEventListener('touchend', e => {
    if (e.touches.length < 2) { lastTouchDist = 0; lastTouchMid = null; }
    if (e.touches.length === 0) { isDragging = false; saveTrailState(); }
  });

  // Double-tap to zoom in
  let lastTap = 0;
  container.addEventListener('touchend', e => {
    if (e.touches.length !== 0) return;
    const now = Date.now();
    if (now - lastTap < 300) {
      const rect = container.getBoundingClientRect();
      const ct = e.changedTouches[0];
      zoomAt(ct.clientX - rect.left, ct.clientY - rect.top, 2);
    }
    lastTap = now;
  });

  // Buttons
  document.getElementById('trail-zoom-in').addEventListener('click', () => {
    zoomAt(container.clientWidth / 2, container.clientHeight / 2, 1.4);
  });
  document.getElementById('trail-zoom-out').addEventListener('click', () => {
    zoomAt(container.clientWidth / 2, container.clientHeight / 2, 0.7);
  });
  document.getElementById('trail-zoom-fit').addEventListener('click', fitToContainer);

  window.addEventListener('resize', () => {
    if (document.getElementById('panel-trail').classList.contains('active')) fitToContainer();
  });
}

const LIFT_NAME_MAP = {
  'エースファミリークワッド': 'Ace Family Quad Lift',
  'キングホリデー第1ペア': 'King Holiday Pair Lift',
  'エースゴンドラ': 'Ace Gondola - 10 Person',
  'エース第3ペアリフト': 'Ace Pair Lift #3',
  'エース第4ペア': 'Ace Pair Lift #4',
  'ワンダーランドチェアA線': 'Wonderland Chair',
  'ワンダーランドチェアB線': 'Wonderland Chair',
  'キング第4リフト': 'King Single Lift #4',
  '花園第3クワッド フード付': 'Hanazono 3',
  '花園第2クワッド': 'Hanazono 2',
  'HANAZONO第1リフトフード付き': 'Hanazono Lift#1',
  'キング第３リフト': 'King Sixpack Lift #3',
  'スインギングモンキー': 'Swinging Monkey',
  'ニセコゴンドラ': 'Niseko Gondola',
  'ジャンボ第１クワッドリフト': 'Jumbo Quad #1',
  'カントリーロードチェア': 'Country Road Chair',
  'クワッドリフト': 'Dream Quad Lift #1',
  'ジャンボ第4ペアリフト': 'Jumbo Pair #4',
  '森のチェア': 'Mori No Chair',
  'King Gondola': 'King Gondola - 8 Person',
  'コミュニティーチェア': 'Community Chair',
  '第１ペアリフト (No1 Pair Lift)': 'Jumbo Pair #2',
  '第２ペアリフト (No2 Pair Lift)': 'Jumbo Pair #3',
  'ジャンボ第3ペアリフト': 'Jumbo Pair #3',
  'アンヌプリゴンドラ': 'Annupuri Gondola',
  'ジャンボ第2ペアリフト': 'Jumbo Pair #2',
  'バンザイチェア': 'Banzai Chair',
  'ドリーム第1クワッドリフト': 'Dream Quad Lift #1',
  'ビレッジエクスプレス': 'Village Express',
  'アッパービレッジゴンドラ': 'Upper Village Gondola',
  'HANAZONO シンフォニーゴンドラ': 'Hanazono Symphony Gondola',
};

// Add English names and filter to only known lifts (initialized after GeoJSON loads)
let LIFT_DATA = null;
function initLiftData() {
  LIFT_DATA = structuredClone(LIFT_GEOJSON);
  LIFT_DATA.features = LIFT_DATA.features
    .filter(f => LIFT_NAME_MAP[f.properties.name])
    .map(f => { f.properties.en_name = LIFT_NAME_MAP[f.properties.name]; return f; });
}

let mapRef = null;

function updateMapLifts() {
  if (!mapRef || !latestData || !LIFT_DATA) return;
  const allLifts = RESORTS.flatMap(r => latestData[r.id]?.lifts || []);
  const statusByName = {};
  allLifts.forEach(l => { statusByName[l.name] = l.status; });

  LIFT_DATA.features.forEach(f => {
    const en = f.properties.en_name;
    f.properties.status = statusByName[en] || 'unknown';
    f.properties.statusColor = statusHex(f.properties.status);
  });

  const src = mapRef.getSource('lifts');
  if (src) src.setData(LIFT_DATA);
}

function liftCenter() {
  let minLng = 999, maxLng = -999, minLat = 999, maxLat = -999;
  LIFT_DATA.features.forEach(f => {
    f.geometry.coordinates.forEach(([lng, lat]) => {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    });
  });
  // Span in km
  const cosLat = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const spanKmX = (maxLng - minLng) * KM_PER_DEGREE * cosLat;
  const spanKmY = (maxLat - minLat) * KM_PER_DEGREE;
  const spanKm = Math.max(spanKmX, spanKmY);
  // Zoom: at z13 ≈ 5km across, each +1 halves it. +0.8 to crop sides
  const zoom = Math.log2(5 / spanKm) + 13 + 0.8;
  return { center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2], zoom };
}

// Decode terrarium DEM: elevation = (R*256 + G + B/256) - 32768
function terrariumToElevation(imageData) {
  const src = imageData.data;
  const elev = new Float32Array(imageData.width * imageData.height);
  for (let i = 0; i < elev.length; i++) {
    elev[i] = (src[i*4] * 256 + src[i*4+1] + src[i*4+2] / 256) - 32768;
  }
  return elev;
}

// Marching squares contour lines on elevation data
function drawContours(ctx, elev, w, h, interval, color, lw) {
  const minE = elev[0], maxE = elev[0];
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < elev.length; i++) {
    if (elev[i] < mn) mn = elev[i];
    if (elev[i] > mx) mx = elev[i];
  }
  const start = Math.ceil(mn / interval) * interval;
  // Segment lookup: case → pairs of edges to connect
  const SEGS = [
    [],                               // 0
    [['left','bottom']],              // 1
    [['bottom','right']],             // 2
    [['left','right']],               // 3
    [['top','right']],                // 4
    [['top','right'],['left','bottom']], // 5 saddle
    [['top','bottom']],               // 6
    [['top','left']],                 // 7
    [['top','left']],                 // 8
    [['top','bottom']],               // 9
    [['top','left'],['bottom','right']], // 10 saddle
    [['top','right']],                // 11
    [['left','right']],               // 12
    [['bottom','right']],             // 13
    [['left','bottom']],              // 14
    [],                               // 15
  ];

  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  for (let level = start; level <= mx; level += interval) {
    ctx.beginPath();
    for (let y = 0; y < h-1; y++) {
      for (let x = 0; x < w-1; x++) {
        const tl = elev[y*w+x], tr = elev[y*w+x+1];
        const br = elev[(y+1)*w+x+1], bl = elev[(y+1)*w+x];
        const code = (tl>=level?8:0)|(tr>=level?4:0)|(br>=level?2:0)|(bl>=level?1:0);
        if (code === 0 || code === 15) continue;
        const lerp = (a,b) => b===a ? 0.5 : (level-a)/(b-a);
        const pts = {
          top: [x+lerp(tl,tr), y],
          right: [x+1, y+lerp(tr,br)],
          bottom: [x+lerp(bl,br), y+1],
          left: [x, y+lerp(tl,bl)]
        };
        SEGS[code].forEach(([e1,e2]) => {
          ctx.moveTo(pts[e1][0], pts[e1][1]);
          ctx.lineTo(pts[e2][0], pts[e2][1]);
        });
      }
    }
    ctx.stroke();
  }
}

// Subtle shaded relief
function drawRelief(ctx, elev, w, h) {
  const relief = ctx.createImageData(w, h);
  const dst = relief.data;
  for (let y = 1; y < h-1; y++) {
    for (let x = 1; x < w-1; x++) {
      const dx = elev[y*w+x+1] - elev[y*w+x-1];
      const dy = elev[(y+1)*w+x] - elev[(y-1)*w+x];
      const len = Math.sqrt(dx*dx + dy*dy);
      const shade = len > 0 ? 0.5 + 0.5*(dx-dy)/(len*2) : 0.5;
      const idx = (y*w+x)*4;
      dst[idx] = 140; dst[idx+1] = 130; dst[idx+2] = 110;
      dst[idx+3] = Math.max(0, Math.min(60, (0.5-shade)*120));
    }
  }
  ctx.putImageData(relief, 0, 0);
}

// Custom protocol: DEM → contour lines + relief → clean pencil map
maplibregl.addProtocol('pencil', async (params) => {
  const url = params.url.replace('pencil://', 'https://');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DEM tile fetch failed: ${res.status}`);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(bmp, 0, 0);
  const elev = terrariumToElevation(ctx.getImageData(0, 0, c.width, c.height));
  ctx.clearRect(0, 0, c.width, c.height);
  // Subtle relief shading
  drawRelief(ctx, elev, c.width, c.height);
  // Minor contour lines every 50m
  drawContours(ctx, elev, c.width, c.height, 50, 'rgba(130,120,100,0.25)', 0.5);
  // Major contour lines every 200m
  drawContours(ctx, elev, c.width, c.height, 200, 'rgba(100,90,70,0.45)', 1.0);
  const outBlob = await new Promise(r => c.toBlob(r, 'image/png'));
  const data = await outBlob.arrayBuffer();
  return { data };
});

function loadMapState() {
  try {
    const saved = JSON.parse(localStorage.getItem('niseko-map-state'));
    if (saved && saved.center) return saved;
  } catch (e) {}
  return null;
}

function initMap() {
  const savedMap = loadMapState();
  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {
        'pencil-topo': {
          type: 'raster',
          tiles: ['pencil://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
          tileSize: 256
        }
      },
      layers: [{
        id: 'bg',
        type: 'background',
        paint: { 'background-color': '#f5f0e8' }
      }, {
        id: 'pencil-topo',
        type: 'raster',
        source: 'pencil-topo',
        paint: {
          'raster-opacity': 0.7
        }
      }]
    },
    center: savedMap ? savedMap.center : [140.6777, 42.8593],
    zoom: savedMap ? savedMap.zoom : 13.28,
    pitch: savedMap ? savedMap.pitch : 35,
    bearing: savedMap ? savedMap.bearing : -40
  });

  mapRef = map;
  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  map.on('load', () => {
    // Ski runs - pencil sketch style
    map.addSource('runs', { type: 'geojson', data: RUN_GEOJSON });
    map.addLayer({
      id: 'runs-line',
      type: 'line',
      source: 'runs',
      paint: {
        'line-color': '#b0a898',
        'line-width': 0.8,
        'line-opacity': 0.4
      }
    });

    // Lifts - solid, status-colored
    map.addSource('lifts', { type: 'geojson', data: LIFT_DATA });
    map.addLayer({
      id: 'lifts-line',
      type: 'line',
      source: 'lifts',
      paint: {
        'line-color': ['coalesce', ['get', 'statusColor'], '#999'],
        'line-width': ['match', ['get', 'type'],
          'gondola', 3.5,
          'mixed_lift', 3.5,
          2.5
        ]
      }
    });

    // Lift labels - dark on light, along the line
    map.addLayer({
      id: 'lift-labels',
      type: 'symbol',
      source: 'lifts',
      layout: {
        'symbol-placement': 'line-center',
        'text-field': ['get', 'en_name'],
        'text-size': 11,
        'text-allow-overlap': true,
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-letter-spacing': 0.05,
        'text-rotation-alignment': 'map'
      },
      paint: {
        'text-color': '#2a2a2a',
        'text-halo-color': 'rgba(245, 240, 232, 0.85)',
        'text-halo-width': 2
      }
    });

    // Update colors if data already loaded
    updateMapLifts();
  });

  // Save map position on move
  map.on('moveend', () => {
    const c = map.getCenter();
    localStorage.setItem('niseko-map-state', JSON.stringify({
      center: [c.lng, c.lat],
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
    }));
  });

  // Position readout
  const posEl = document.getElementById('map-pos');
  function updatePos() {
    const c = map.getCenter();
    posEl.textContent = `center: [${c.lng.toFixed(4)}, ${c.lat.toFixed(4)}]  zoom: ${map.getZoom().toFixed(2)}  bearing: ${map.getBearing().toFixed(1)}  pitch: ${map.getPitch().toFixed(1)}`;
  }
  map.on('move', updatePos);
  posEl.style.display = 'block';
  updatePos();
}

const STATUS_INFO = {
  'OPERATING':                       { css: 'operating', label: 'Open',    color: 'var(--green)',  hex: '#7bed9f' },
  'OPERATION_SLOWED':                { css: 'slowed',    label: 'Slowed',  color: 'var(--yellow)', hex: '#eccc68' },
  'STANDBY':                         { css: 'standby',   label: 'Standby', color: 'var(--blue)',   hex: '#70a1ff' },
  'OPERATION_TEMPORARILY_SUSPENDED': { css: 'on-hold',   label: 'Hold', color: 'var(--orange)', hex: '#ff9f43' },
  'SUSPENDED_CLOSED':                { css: 'closed',    label: 'Closed',  color: 'var(--purple)', hex: '#a29bfe' },
  'CLOSED':                          { css: 'closed',    label: 'Closed',  color: 'var(--purple)', hex: '#a29bfe' },
};
const DEFAULT_STATUS_INFO = { css: 'closed', label: 'Closed', color: 'var(--purple)', hex: '#555' };

function statusInfo(status) { return STATUS_INFO[status] || DEFAULT_STATUS_INFO; }
function statusClass(status) { return statusInfo(status).css; }
function statusLabel(status) { return statusInfo(status).label; }
function statusHex(status) { return statusInfo(status).hex; }

function isRunning(status) {
  return status === 'OPERATING' || status === 'OPERATION_SLOWED';
}

function jstNow() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
  return { h: parseInt(parts.find(p => p.type === 'hour').value), m: parseInt(parts.find(p => p.type === 'minute').value) };
}

function jstNowMinutes() { const { h, m } = jstNow(); return h * 60 + m; }

function fmtTime(t) {
  const [h, m] = typeof t === 'string' ? t.split(':').map(Number) : [t.h, t.m];
  const hr = h % 12 || 12;
  const suffix = h < 12 ? 'a' : 'p';
  return m === 0 ? `${hr}${suffix}` : `${hr}:${String(m).padStart(2,'0')}${suffix}`;
}

function liftTimeLabel(start, end) {
  const nowMin = jstNowMinutes();
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (nowMin >= sh * 60 + sm && nowMin < eh * 60 + em) {
    return `til ${fmtTime(end)}`;
  }
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

function timeAgo(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function latestUpdateDate(lifts) {
  if (!lifts || lifts.length === 0) return null;
  return lifts.reduce((latest, l) => {
    if (!l.updateDate) return latest;
    return !latest || l.updateDate > latest ? l.updateDate : latest;
  }, null);
}

function cToF(c) { return Math.round(c * 9 / 5 + 32); }
function cmToIn(cm) { return Math.round(cm / 2.54); }


function dataHash(data) {
  const parts = [];
  for (const r of RESORTS) {
    const rd = data[r.id];
    if (!rd) continue;
    if (rd.lifts) rd.lifts.forEach(l => parts.push(l.id + ':' + l.status));
    if (rd.weather) rd.weather.forEach(w => parts.push(w.name + ':' + w.temperature + ':' + w.snow_accumulation));
  }
  return parts.join('|');
}

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'accept': '*/*', 'Referer': REFERER } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function fetchResortData(path, key) {
  return Promise.all(RESORTS.map(r =>
    fetchJSON(`${API_BASE}/${path}?${key === 'lifts' ? 'facilityType=lift&' : ''}lang=en&skiareaId=${r.id}`)
      .then(d => [r.id, d.results || []])
      .catch(() => [r.id, null])
  )).then(results => Object.fromEntries(results));
}

async function fetchAllData() {
  const [lifts, weather] = await Promise.all([
    fetchResortData('latest-facility/backward', 'lifts'),
    fetchResortData('latest-weather/backward', 'weather'),
  ]);
  const data = {};
  for (const r of RESORTS) {
    data[r.id] = { resort: r, lifts: lifts[r.id], weather: weather[r.id] };
  }
  return data;
}

function detectChanges(newData) {
  const now = Date.now();
  for (const resortId in newData) {
    const lifts = newData[resortId].lifts;
    if (!lifts) continue;
    const prev = previousData[resortId]?.lifts;
    if (!prev) continue;
    for (const lift of lifts) {
      const prevLift = prev.find(p => p.id === lift.id);
      if (prevLift && prevLift.status !== lift.status) {
        changeLog.push({ time: now, resort: newData[resortId].resort.name, lift: lift.name, from: statusLabel(prevLift.status), to: statusLabel(lift.status) });
      }
    }
  }
  changeLog = changeLog.filter(c => now - c.time < CHANGE_WINDOW_MS);
}

function renderChanges() {
  const banner = document.getElementById('changes-banner');
  const list = document.getElementById('changes-list');
  if (changeLog.length === 0) { banner.classList.remove('visible'); return; }
  banner.classList.add('visible');
  list.innerHTML = '';
  changeLog.slice().reverse().forEach(c => {
    const ago = Math.round((Date.now() - c.time) / 60000);
    const timeStr = ago < 1 ? 'just now' : `${ago}m ago`;
    const item = document.createElement('div');
    item.className = 'change-item';
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = timeStr;
    item.appendChild(time);
    item.appendChild(document.createTextNode(`${c.resort} \u2013 ${c.lift}: ${c.from} \u2192 ${c.to}`));
    list.appendChild(item);
  });
}

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

const JP_EN = {
  '吹雪': 'Snow Storm', '雪': 'Snow', '曇り': 'Cloudy', '晴れ': 'Clear',
  '粉雪': 'Powder Snow', '圧雪': 'Packed Powder', '湿雪': 'Wet Snow',
  '全面可能': 'All Courses Open', '一部可能': 'Partial Open', '閉鎖': 'Closed',
  'なし': '—',
};
function tr(s) { return s ? (JP_EN[s] || s) : '—'; }

function renderWeather(data) {
  const container = document.getElementById('weather-content');
  const grid = document.createElement('div');
  grid.className = 'weather-grid';

  function createWxRow(labelText, valueText) {
    const row = document.createElement('div');
    row.className = 'wx-row';
    const lbl = document.createElement('span');
    lbl.className = 'wx-label';
    lbl.textContent = labelText;
    const val = document.createElement('span');
    val.className = 'wx-val';
    val.textContent = valueText;
    row.appendChild(lbl);
    row.appendChild(val);
    return row;
  }

  function createStation(label, s) {
    const station = document.createElement('div');
    station.className = 'wx-station';
    const h4 = document.createElement('h4');
    h4.textContent = label;
    const temp = document.createElement('div');
    temp.className = 'wx-temp';
    temp.textContent = `${cToF(s.temperature)}\u00B0F`;
    const cond = document.createElement('div');
    cond.className = 'wx-condition';
    cond.textContent = `${wxIcon(tr(s.weather))} ${tr(s.weather)}`;
    station.appendChild(h4);
    station.appendChild(temp);
    station.appendChild(cond);
    station.appendChild(createWxRow('Snow', `${cmToIn(s.snow_accumulation)}" (${s.snow_accumulation}cm)`));
    station.appendChild(createWxRow('24h New', s.snow_accumulation_difference != null ? `${cmToIn(s.snow_accumulation_difference)}" (${s.snow_accumulation_difference}cm)` : '\u2014'));
    station.appendChild(createWxRow('Condition', tr(s.snow_state)));
    station.appendChild(createWxRow('Wind', s.wind_speed || '\u2014'));
    station.appendChild(createWxRow('Courses', tr(s.cource_state)));
    return station;
  }

  RESORTS.forEach(r => {
    const card = document.createElement('div');
    card.className = 'weather-card';
    const h3 = document.createElement('h3');
    h3.textContent = r.name;
    card.appendChild(h3);

    const wd = data[r.id]?.weather;
    if (!wd || wd.length === 0) {
      const p = document.createElement('p');
      p.style.color = 'var(--text-dim)';
      p.textContent = 'No data';
      card.appendChild(p);
    } else {
      const top = wd.find(w => /top|peak|summit/i.test(w.name)) || wd[0];
      const base = wd.find(w => /base|foot/i.test(w.name)) || wd[wd.length - 1];
      const stations = document.createElement('div');
      stations.className = 'wx-stations';
      stations.appendChild(createStation('Summit', top));
      stations.appendChild(createStation('Base', base));
      card.appendChild(stations);
    }
    grid.appendChild(card);
  });

  container.innerHTML = '';
  container.appendChild(grid);
}

function renderLifts(data) {
  const content = document.getElementById('lifts-content');
  const resorts = document.createElement('div');
  resorts.className = 'resorts';

  RESORTS.forEach(r => {
    const card = document.createElement('div');
    card.className = 'resort-card';

    const rd = data[r.id];
    if (!rd || !rd.lifts) {
      const header = document.createElement('div');
      header.className = 'resort-header';
      const h2 = document.createElement('h2');
      h2.textContent = r.name;
      const stats = document.createElement('span');
      stats.className = 'resort-stats';
      stats.textContent = 'Error';
      header.appendChild(h2);
      header.appendChild(stats);
      card.appendChild(header);
      resorts.appendChild(card);
      return;
    }

    const lifts = [...rd.lifts].sort((a, b) => a.name.localeCompare(b.name));
    const open = lifts.filter(l => isRunning(l.status)).length;
    const updated = latestUpdateDate(lifts);
    const agoText = updated ? timeAgo(updated) : '';

    const header = document.createElement('div');
    header.className = 'resort-header';
    const h2 = document.createElement('h2');
    h2.textContent = r.name;
    if (agoText) {
      const updSpan = document.createElement('span');
      updSpan.className = 'resort-updated';
      updSpan.textContent = agoText;
      h2.appendChild(updSpan);
    }
    const stats = document.createElement('span');
    stats.className = 'resort-stats';
    const openCount = document.createElement('span');
    openCount.className = 'open-count';
    openCount.textContent = open;
    stats.appendChild(openCount);
    stats.appendChild(document.createTextNode(` / ${lifts.length}`));
    header.appendChild(h2);
    header.appendChild(stats);
    card.appendChild(header);

    const liftList = document.createElement('div');
    liftList.className = 'lift-list';
    lifts.forEach(l => {
      const cls = statusClass(l.status);
      const changed = changeLog.some(c => c.lift === l.name && (Date.now() - c.time) < CHANGE_HIGHLIGHT_MS);
      const row = document.createElement('div');
      row.className = 'lift-row' + (changed ? ' changed' : '');
      const info = document.createElement('div');
      info.className = 'lift-info';
      const name = document.createElement('div');
      name.className = 'lift-name';
      name.textContent = l.name;
      const detail = document.createElement('div');
      detail.className = 'lift-detail';
      detail.textContent = liftTimeLabel(l.start_time, l.end_time);
      info.appendChild(name);
      info.appendChild(detail);
      const statusText = document.createElement('div');
      statusText.className = 'lift-status-text ' + cls;
      statusText.textContent = statusLabel(l.status);
      row.appendChild(info);
      row.appendChild(statusText);
      liftList.appendChild(row);
    });
    card.appendChild(liftList);
    resorts.appendChild(card);
  });

  content.innerHTML = '';
  content.appendChild(resorts);

  const allLifts = RESORTS.flatMap(r => data[r.id]?.lifts || []);
  const grouped = {};
  for (const l of allLifts) {
    const css = statusClass(l.status);
    grouped[css] = (grouped[css] || 0) + 1;
  }
  const summaryOrder = ['operating', 'slowed', 'standby', 'on-hold', 'closed'];
  const summaryBar = document.getElementById('summary-bar');
  summaryBar.innerHTML = '';
  for (const css of summaryOrder) {
    const count = grouped[css] || 0;
    if (count === 0 && css !== 'operating' && css !== 'on-hold') continue;
    const entry = Object.values(STATUS_INFO).find(s => s.css === css) || DEFAULT_STATUS_INFO;
    const chip = document.createElement('div');
    chip.className = 'summary-chip';
    const countSpan = document.createElement('span');
    countSpan.className = 'count';
    countSpan.style.color = entry.color;
    countSpan.textContent = count;
    chip.appendChild(countSpan);
    chip.appendChild(document.createTextNode(entry.label));
    summaryBar.appendChild(chip);
  }
  const totalChip = document.createElement('div');
  totalChip.className = 'summary-chip';
  const totalCount = document.createElement('span');
  totalCount.className = 'count';
  totalCount.style.color = 'var(--text)';
  totalCount.textContent = allLifts.length;
  totalChip.appendChild(totalCount);
  totalChip.appendChild(document.createTextNode('Total'));
  summaryBar.appendChild(totalChip);
}

function updateMeta(error) {
  const lastUpdate = document.getElementById('last-update');
  if (error) {
    lastUpdate.textContent = 'Update failed';
    lastUpdate.style.color = 'var(--red)';
  } else {
    lastUpdate.style.color = '';
    lastUpdate.textContent = `Updated ${fmtTime(jstNow())}`;
  }
}

async function refresh() {
  fetchCount++;
  const errorBanner = document.getElementById('error-banner');
  try {
    const data = await fetchAllData();
    if (fetchCount > 1) detectChanges(data);
    previousData = data;
    latestData = data;
    const hash = dataHash(data);
    if (hash !== lastRenderedHash || changeLog.length > 0) {
      lastRenderedHash = hash;
      renderLifts(data);
      renderWeather(data);
      renderChanges();
      updateMapLifts();
    }
    updateMeta(false);
    errorBanner.classList.remove('visible');
  } catch (e) {
    updateMeta(true);
    console.error('Refresh failed:', e);
    errorBanner.textContent = 'Unable to update lift data. Will retry shortly.';
    errorBanner.classList.add('visible');
  }
  refreshTimer = setTimeout(refresh, REFRESH_INTERVAL_MS);
}

async function init() {
  await loadGeoJSON();
  initLiftData();
  renderSettings();
  refresh();
}

init();
