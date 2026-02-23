// =====================================================
// Resort Adapter Registry
// =====================================================
const RESORT_ADAPTERS = {};
let activeResortId = localStorage.getItem('ski-active-resort') || 'niseko';

function getActiveAdapter() {
  return RESORT_ADAPTERS[activeResortId] || RESORT_ADAPTERS.niseko;
}

function switchResort(id, skipPush) {
  if (!RESORT_ADAPTERS[id]) return;
  activeResortId = id;
  localStorage.setItem('ski-active-resort', id);
  if (!skipPush) history.pushState(null, '', '/' + id);
  // Reset state
  previousData = null;
  latestData = null;
  lastRenderedHash = '';
  changeLog = [];
  fetchCount = 0;
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
  // Reset map state
  mapInit = false;
  trailMapInit = false;
  mapRef = null;
  // Update UI
  updateHeader();
  updateTabVisibility();
  renderResortPicker();
  // Clear panels
  document.getElementById('lifts-content').innerHTML =
    '<div class="loading"><div class="spinner"></div>Fetching lift status...</div>';
  document.getElementById('weather-content').innerHTML = '';
  const mapContainer = document.getElementById('map');
  if (mapContainer) mapContainer.innerHTML = '';
  // Switch to Lifts tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('.tab-btn[data-tab="lifts"]').classList.add('active');
  document.getElementById('panel-lifts').classList.add('active');
  refreshGeneration++;
  refresh();
}

// =====================================================
// Shared constants & state
// =====================================================
const REFRESH_INTERVAL_MS = 120000;
const CHANGE_WINDOW_MS = 600000;
const CHANGE_HIGHLIGHT_MS = 30000;
const WHEEL_ZOOM_IN = 1.15;
const WHEEL_ZOOM_OUT = 0.87;
const KM_PER_DEGREE = 111;

let previousData = null;
let latestData = null;
let lastRenderedHash = '';
let changeLog = [];
let refreshTimer = null;
let fetchCount = 0;
let refreshGeneration = 0;
let consecutiveFailures = 0;

// =====================================================
// Status maps (per-resort API normalization)
// =====================================================
const SNOWBIRD_STATUS_MAP = {
  'open': 'OPERATING',
  'expected': 'CLOSED',
  'closed': 'CLOSED',
};

// =====================================================
// Niseko Adapter
// =====================================================
const NISEKO_STATUS_MAP = {
  'OPERATION_TEMPORARILY_SUSPENDED': 'ON_HOLD',
  'SUSPENDED_CLOSED': 'CLOSED',
};

RESORT_ADAPTERS.niseko = {
  id: 'niseko',
  name: 'Niseko United',
  group: 'Niseko United',
  timezone: 'Asia/Tokyo',
  headerImage: 'yotei.png',
  capabilities: { weather: true, trailMap: true, interactiveMap: true },

  RESORTS: [
    { id: '379', name: 'Hanazono' },
    { id: '390', name: 'Grand Hirafu' },
    { id: '393', name: 'Annupuri' },
    { id: '394', name: 'Niseko Village' },
  ],

  API_BASE: '/api/niseko',

  LIFT_NAME_MAP: {
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
  },

  LIFT_GEOJSON: null,
  RUN_GEOJSON: null,
  LIFT_DATA: null,

  async loadGeoJSON() {
    try {
      const [liftsRes, runsRes] = await Promise.all([
        fetch('data/lifts.geojson'),
        fetch('data/runs.geojson'),
      ]);
      if (!liftsRes.ok || !runsRes.ok) throw new Error('GeoJSON fetch failed');
      this.LIFT_GEOJSON = await liftsRes.json();
      this.RUN_GEOJSON = await runsRes.json();
    } catch (e) {
      console.error('Failed to load GeoJSON:', e);
      this.LIFT_GEOJSON = { type: 'FeatureCollection', features: [] };
      this.RUN_GEOJSON = { type: 'FeatureCollection', features: [] };
    }
  },

  initLiftData() {
    this.LIFT_DATA = structuredClone(this.LIFT_GEOJSON);
    this.LIFT_DATA.features = this.LIFT_DATA.features
      .filter(f => this.LIFT_NAME_MAP[f.properties.name])
      .map(f => { f.properties.en_name = this.LIFT_NAME_MAP[f.properties.name]; return f; });
  },

  async fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  fetchResortData(endpoint) {
    return Promise.all(this.RESORTS.map(r =>
      this.fetchJSON(`${this.API_BASE}/${endpoint}?skiareaId=${r.id}`)
        .then(d => [r.id, d.results || []])
        .catch(() => [r.id, null])
    )).then(results => Object.fromEntries(results));
  },

  async fetchData() {
    const [lifts, weather] = await Promise.all([
      this.fetchResortData('lifts'),
      this.fetchResortData('weather'),
    ]);
    const subResorts = this.RESORTS.map(r => ({
      id: r.id,
      name: r.name,
      lifts: lifts[r.id] ? lifts[r.id].map(l => ({
        id: l.id,
        name: l.name,
        status: NISEKO_STATUS_MAP[l.status] || l.status,
        scheduled: false,
        start_time: l.start_time,
        end_time: l.end_time,
        updateDate: l.updateDate,
        comment: l.comment || null,
      })) : null,
      weather: weather[r.id] || null,
    }));
    return { subResorts, capabilities: this.capabilities };
  },

  async initMap() {
    if (!this.LIFT_DATA) {
      await this.loadGeoJSON();
      this.initLiftData();
    }
    initNisekoMap(this);
  },

  initTrailMap() {
    initNisekoTrailMap();
  },

  updateMapLifts(data) {
    if (!mapRef || !data || !this.LIFT_DATA) return;
    const allLifts = data.subResorts.flatMap(sr => sr.lifts || []);
    const statusByName = {};
    allLifts.forEach(l => { statusByName[l.name] = l.status; });

    this.LIFT_DATA.features.forEach(f => {
      const en = f.properties.en_name;
      f.properties.status = statusByName[en] || 'unknown';
      f.properties.statusColor = statusHex(f.properties.status);
    });

    const src = mapRef.getSource('lifts');
    if (src) src.setData(this.LIFT_DATA);
  },
};

// =====================================================
// Vail Resorts Adapter Factory
// =====================================================
const VAIL_RESORTS = [
  // Colorado
  { id: 'vail', name: 'Vail', region: 'Colorado', timezone: 'America/Denver' },
  { id: 'beavercreek', name: 'Beaver Creek', region: 'Colorado', timezone: 'America/Denver' },
  { id: 'breckenridge', name: 'Breckenridge', region: 'Colorado', timezone: 'America/Denver' },
  { id: 'keystone', name: 'Keystone', region: 'Colorado', timezone: 'America/Denver' },
  { id: 'crestedbutte', name: 'Crested Butte', region: 'Colorado', timezone: 'America/Denver' },
  // Utah
  { id: 'parkcity', name: 'Park City Mountain', region: 'Utah', timezone: 'America/Denver' },
  // Tahoe
  { id: 'heavenly', name: 'Heavenly', region: 'Tahoe', timezone: 'America/Los_Angeles' },
  { id: 'northstar', name: 'Northstar', region: 'Tahoe', timezone: 'America/Los_Angeles' },
  { id: 'kirkwood', name: 'Kirkwood', region: 'Tahoe', timezone: 'America/Los_Angeles' },
  // Pacific NW
  { id: 'stevenspass', name: 'Stevens Pass', region: 'Pacific NW', timezone: 'America/Los_Angeles' },
  { id: 'whistlerblackcomb', name: 'Whistler Blackcomb', region: 'British Columbia', timezone: 'America/Vancouver' },
  // Vermont
  { id: 'stowe', name: 'Stowe', region: 'Vermont', timezone: 'America/New_York' },
  { id: 'okemo', name: 'Okemo', region: 'Vermont', timezone: 'America/New_York' },
  { id: 'mtsnow', name: 'Mount Snow', region: 'Vermont', timezone: 'America/New_York' },
  // New Hampshire
  { id: 'mountsunapee', name: 'Mount Sunapee', region: 'New Hampshire', timezone: 'America/New_York' },
  { id: 'attitashmountain', name: 'Attitash', region: 'New Hampshire', timezone: 'America/New_York' },
  { id: 'wildcatmountain', name: 'Wildcat Mountain', region: 'New Hampshire', timezone: 'America/New_York' },
  { id: 'crotchedmountain', name: 'Crotched Mountain', region: 'New Hampshire', timezone: 'America/New_York' },
  // New York
  { id: 'hunter', name: 'Hunter Mountain', region: 'New York', timezone: 'America/New_York' },
  // Mid-Atlantic
  { id: 'sevensprings', name: 'Seven Springs', region: 'Mid-Atlantic', timezone: 'America/New_York' },
  { id: 'libertymountain', name: 'Liberty Mountain', region: 'Mid-Atlantic', timezone: 'America/New_York' },
  { id: 'roundtopmountain', name: 'Roundtop Mountain', region: 'Mid-Atlantic', timezone: 'America/New_York' },
  { id: 'whitetail', name: 'Whitetail', region: 'Mid-Atlantic', timezone: 'America/New_York' },
  { id: 'jackfrostbigboulder', name: 'Jack Frost / Big Boulder', region: 'Mid-Atlantic', timezone: 'America/New_York' },
  { id: 'hiddenvalleypa', name: 'Hidden Valley PA', region: 'Mid-Atlantic', timezone: 'America/New_York' },
  { id: 'laurelmountain', name: 'Laurel Mountain', region: 'Mid-Atlantic', timezone: 'America/New_York' },
  // Midwest
  { id: 'aftonalps', name: 'Afton Alps', region: 'Midwest', timezone: 'America/Chicago' },
  { id: 'mtbrighton', name: 'Mt. Brighton', region: 'Midwest', timezone: 'America/Detroit' },
  { id: 'wilmotmountain', name: 'Wilmot Mountain', region: 'Midwest', timezone: 'America/Chicago' },
  { id: 'alpinevalley', name: 'Alpine Valley', region: 'Midwest', timezone: 'America/New_York' },
  { id: 'bmbw', name: 'Boston Mills / Brandywine', region: 'Midwest', timezone: 'America/New_York' },
  { id: 'madrivermountain', name: 'Mad River Mountain', region: 'Midwest', timezone: 'America/New_York' },
  { id: 'hiddenvalley', name: 'Hidden Valley MO', region: 'Midwest', timezone: 'America/Chicago' },
  { id: 'snowcreek', name: 'Snow Creek', region: 'Midwest', timezone: 'America/Chicago' },
  { id: 'paolipeaks', name: 'Paoli Peaks', region: 'Midwest', timezone: 'America/Indiana/Indianapolis' },
];

const VAIL_STATUS_MAP = {
  'Open': 'OPERATING',
  'Scheduled': 'CLOSED',
  'OnHold': 'ON_HOLD',
  'Closed': 'CLOSED',
};

function createVailAdapter(resort) {
  return {
    id: resort.id,
    name: resort.name,
    group: 'Epic Pass',
    region: resort.region,
    timezone: resort.timezone,
    headerImage: null,
    capabilities: { weather: true, trailMap: false, interactiveMap: false },

    async fetchData() {
      const [terrainRes, weatherRes] = await Promise.all([
        fetch(`/api/vail/${resort.id}/terrain`),
        fetch(`/api/vail/${resort.id}/weather`).catch(() => null),
      ]);
      if (!terrainRes.ok) throw new Error(`Terrain HTTP ${terrainRes.status}`);
      const terrain = await terrainRes.json();
      if (terrain.error) throw new Error(terrain.error);

      // Group lifts by mountain area
      const areas = {};
      for (const lift of (terrain.Lifts || [])) {
        const area = lift.Mountain || resort.name;
        if (!areas[area]) areas[area] = [];
        let status = VAIL_STATUS_MAP[lift.Status];
        if (!status) {
          console.warn(`${resort.name}: unknown status "${lift.Status}" for "${lift.Name}"`);
          status = 'CLOSED';
        }
        areas[area].push({
          id: lift.Name,
          name: lift.Name,
          status: status,
          scheduled: lift.Status === 'Scheduled',
          start_time: lift.OpenTime || null,
          end_time: lift.CloseTime || null,
          waitMinutes: lift.WaitTimeInMinutes != null ? lift.WaitTimeInMinutes : null,
          updateDate: null,
          liftType: lift.Type || null,
          capacity: lift.Capacity || null,
        });
      }

      // Build weather from Vail weather API
      let weather = null;
      if (weatherRes && weatherRes.ok) {
        try {
          const w = await weatherRes.json();
          const snowReading = w.BaseSnowReadings?.MidMountain;
          const newSnow24 = w.NewSnowReadings?.TwentyFourHours;
          weather = [{
            name: resort.name,
            weather: w.SnowConditions || '',
            temperature: null,
            snow_accumulation: snowReading ? parseInt(snowReading.Centimeters, 10) : null,
            snow_accumulation_difference: newSnow24 ? parseInt(newSnow24.Centimeters, 10) : null,
            snow_state: w.SnowConditions || null,
            wind_speed: null,
            cource_state: `${w.Runs?.Open || 0} / ${w.Runs?.Total || 0} runs`,
          }];
        } catch (e) {
          console.warn(`${resort.name} weather parse failed:`, e.message);
        }
      }

      const subResorts = Object.entries(areas).map(([name, lifts]) => ({
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: name,
        lifts: lifts,
        weather: null,
      }));

      // Attach weather to first sub-resort
      if (weather && subResorts.length > 0) {
        subResorts[0].weather = weather;
      }

      return { subResorts, capabilities: this.capabilities };
    },
  };
}

// Register all Vail resort adapters
for (const resort of VAIL_RESORTS) {
  RESORT_ADAPTERS[resort.id] = createVailAdapter(resort);
}

// =====================================================
// Ikon Pass: Snowbird Adapter
// =====================================================
RESORT_ADAPTERS.snowbird = {
  id: 'snowbird',
  name: 'Snowbird',
  group: 'Ikon Pass',
  region: 'Utah',
  timezone: 'America/Denver',
  headerImage: null,
  capabilities: { weather: false, trailMap: false, interactiveMap: false },

  async fetchData() {
    const res = await fetch('/api/snowbird/lifts');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const lifts = await res.json();

    const areas = {};
    for (const lift of lifts) {
      const area = lift.sector?.name || 'Snowbird';
      if (!areas[area]) areas[area] = [];
      const status = SNOWBIRD_STATUS_MAP[lift.status] || 'CLOSED';
      let start = null, end = null;
      if (lift.hours) {
        const m = lift.hours.trim().match(/^([\d:]+\s*[AP]M)\s*-\s*([\d:]+\s*[AP]M)$/i);
        if (m) { start = to24(m[1]); end = to24(m[2]); }
      }
      areas[area].push({
        id: lift.name,
        name: lift.name,
        status,
        scheduled: lift.status === 'expected',
        start_time: start,
        end_time: end,
        waitMinutes: null,
        updateDate: null,
      });
    }

    const subResorts = Object.entries(areas).map(([name, lifts]) => ({
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name, lifts, weather: null,
    }));

    return { subResorts, capabilities: this.capabilities };
  },
};

// =====================================================
// Ikon Pass: Alta Adapter
// =====================================================
RESORT_ADAPTERS.alta = {
  id: 'alta',
  name: 'Alta',
  group: 'Ikon Pass',
  region: 'Utah',
  timezone: 'America/Denver',
  headerImage: null,
  capabilities: { weather: false, trailMap: false, interactiveMap: false },

  async fetchData() {
    const res = await fetch('/api/alta');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const lifts = (data.lifts || []).map(lift => {
      const status = lift.open ? 'OPERATING' : 'CLOSED';
      return {
        id: lift.name,
        name: lift.name,
        status,
        scheduled: !lift.open && lift.opening_at != null,
        start_time: lift.opening_at || null,
        end_time: lift.closing_at || null,
        waitMinutes: null,
        updateDate: null,
      };
    });

    return {
      subResorts: [{ id: 'alta', name: 'Alta', lifts, weather: null }],
      capabilities: this.capabilities,
    };
  },
};

// =====================================================
// Theme & Font Settings
// =====================================================
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

let currentTheme = localStorage.getItem('ski-theme') || 'light';
let currentFontScale = parseFloat(localStorage.getItem('ski-font-scale')) || 1;

function applyTheme(name) {
  currentTheme = name;
  if (name === 'light') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', name);
  }
  localStorage.setItem('ski-theme', name);

  const theme = THEMES.find(t => t.name === name);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && theme) meta.content = theme.bg;
}

function applyFontScale(scale) {
  currentFontScale = scale;
  document.documentElement.style.setProperty('--font-scale', scale);
  localStorage.setItem('ski-font-scale', String(scale));
}

function renderResortPicker() {
  const picker = document.getElementById('resort-picker');
  if (!picker) return;
  picker.innerHTML = '';

  // Collect all adapters and group by adapter.group (preserving registration order)
  const groups = [];
  const groupMap = {};
  for (const adapter of Object.values(RESORT_ADAPTERS)) {
    const g = adapter.group || adapter.name;
    if (!groupMap[g]) {
      groupMap[g] = [];
      groups.push(g);
    }
    groupMap[g].push(adapter);
  }

  for (const groupName of groups) {
    const adapters = groupMap[groupName];

    // Single-resort group (e.g. Niseko): render as a standalone card, no heading
    if (adapters.length === 1 && !adapters[0].region) {
      const a = adapters[0];
      const card = document.createElement('div');
      card.className = 'resort-option' + (activeResortId === a.id ? ' selected' : '');
      card.textContent = a.name;
      card.addEventListener('click', () => {
        if (activeResortId !== a.id) switchResort(a.id);
      });
      picker.appendChild(card);
      continue;
    }

    // Multi-resort group: heading + sub-group by region
    const h3 = document.createElement('h3');
    h3.className = 'resort-picker-heading';
    h3.textContent = groupName;
    picker.appendChild(h3);

    // Sub-group by region, preserving order
    const regions = [];
    const regionMap = {};
    for (const a of adapters) {
      const region = a.region || groupName;
      if (!regionMap[region]) {
        regionMap[region] = [];
        regions.push(region);
      }
      regionMap[region].push(a);
    }

    for (const region of regions) {
      const group = document.createElement('div');
      group.className = 'resort-region-group';
      const label = document.createElement('div');
      label.className = 'resort-region-label';
      label.textContent = region;
      group.appendChild(label);

      const row = document.createElement('div');
      row.className = 'resort-region-row';
      for (const a of regionMap[region]) {
        const card = document.createElement('div');
        card.className = 'resort-option resort-option-sm' + (activeResortId === a.id ? ' selected' : '');
        card.textContent = a.name;
        card.addEventListener('click', () => {
          if (activeResortId !== a.id) switchResort(a.id);
        });
        row.appendChild(card);
      }
      group.appendChild(row);
      picker.appendChild(group);
    }
  }
}

function renderSettings() {
  // Resort picker
  renderResortPicker();

  // Theme picker
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

// =====================================================
// Tab Switching
// =====================================================
let mapInit = false;
let trailMapInit = false;

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    const adapter = getActiveAdapter();
    if (btn.dataset.tab === 'map' && !mapInit && adapter.initMap) {
      mapInit = true;
      adapter.initMap();
    }
    if (btn.dataset.tab === 'trail' && !trailMapInit && adapter.initTrailMap) {
      trailMapInit = true;
      adapter.initTrailMap();
    }
  });
});

// =====================================================
// Tab Visibility
// =====================================================
function updateTabVisibility() {
  const adapter = getActiveAdapter();
  const caps = adapter.capabilities;
  const tabMap = {
    weather: caps.weather,
    trail: caps.trailMap,
    map: caps.interactiveMap,
  };
  for (const [tab, visible] of Object.entries(tabMap)) {
    const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
    const panel = document.getElementById(`panel-${tab}`);
    if (btn) btn.style.display = visible ? '' : 'none';
    if (panel && !visible) panel.classList.remove('active');
  }
  // If the currently active tab is hidden, switch to lifts
  const activeBtn = document.querySelector('.tab-btn.active');
  if (activeBtn && activeBtn.style.display === 'none') {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="lifts"]').classList.add('active');
    document.getElementById('panel-lifts').classList.add('active');
  }
}

// =====================================================
// Header Updates
// =====================================================
function updateHeader() {
  const adapter = getActiveAdapter();
  document.querySelector('.header-line1').textContent = adapter.name;
  document.title = adapter.name;

  const mountain = document.querySelector('.header-mountain');
  if (mountain) {
    if (adapter.headerImage) {
      mountain.style.display = '';
      mountain.style.setProperty('-webkit-mask-image', `url(${adapter.headerImage})`);
      mountain.style.setProperty('mask-image', `url(${adapter.headerImage})`);
    } else {
      mountain.style.display = 'none';
    }
  }
}

// =====================================================
// Trail Map - pinch-zoom & pan (Niseko-specific)
// =====================================================
function initNisekoTrailMap() {
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
    localStorage.setItem('ski-trail-state', JSON.stringify({ scale, tx, ty }));
  }

  function loadTrailState() {
    try {
      const saved = JSON.parse(localStorage.getItem('ski-trail-state'));
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

// =====================================================
// Interactive Map (Niseko-specific)
// =====================================================
let mapRef = null;

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
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < elev.length; i++) {
    if (elev[i] < mn) mn = elev[i];
    if (elev[i] > mx) mx = elev[i];
  }
  const start = Math.ceil(mn / interval) * interval;
  const SEGS = [
    [],
    [['left','bottom']],
    [['bottom','right']],
    [['left','right']],
    [['top','right']],
    [['top','right'],['left','bottom']],
    [['top','bottom']],
    [['top','left']],
    [['top','left']],
    [['top','bottom']],
    [['top','left'],['bottom','right']],
    [['top','right']],
    [['left','right']],
    [['bottom','right']],
    [['left','bottom']],
    [],
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
  drawRelief(ctx, elev, c.width, c.height);
  drawContours(ctx, elev, c.width, c.height, 50, 'rgba(130,120,100,0.25)', 0.5);
  drawContours(ctx, elev, c.width, c.height, 200, 'rgba(100,90,70,0.45)', 1.0);
  const outBlob = await new Promise(r => c.toBlob(r, 'image/png'));
  const data = await outBlob.arrayBuffer();
  return { data };
});

function loadMapState() {
  try {
    const saved = JSON.parse(localStorage.getItem('ski-map-state'));
    if (saved && saved.center) return saved;
  } catch (e) {}
  return null;
}

function initNisekoMap(adapter) {
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
    map.addSource('runs', { type: 'geojson', data: adapter.RUN_GEOJSON });
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

    map.addSource('lifts', { type: 'geojson', data: adapter.LIFT_DATA });
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

    if (latestData) adapter.updateMapLifts(latestData);
  });

  map.on('moveend', () => {
    const c = map.getCenter();
    localStorage.setItem('ski-map-state', JSON.stringify({
      center: [c.lng, c.lat],
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
    }));
  });

  const posEl = document.getElementById('map-pos');
  function updatePos() {
    const c = map.getCenter();
    posEl.textContent = `center: [${c.lng.toFixed(4)}, ${c.lat.toFixed(4)}]  zoom: ${map.getZoom().toFixed(2)}  bearing: ${map.getBearing().toFixed(1)}  pitch: ${map.getPitch().toFixed(1)}`;
  }
  map.on('move', updatePos);
  posEl.style.display = 'block';
  updatePos();
}

// =====================================================
// Status helpers
// =====================================================
// Adapters normalize raw API statuses to these keys before data reaches shared code.
const STATUS_INFO = {
  'OPERATING':       { css: 'operating', label: 'open',    color: 'var(--green)',  hex: '#7bed9f' },
  'OPERATION_SLOWED': { css: 'slowed',    label: 'slowed',  color: 'var(--yellow)', hex: '#eccc68' },
  'STANDBY':         { css: 'standby',   label: 'standby', color: 'var(--yellow)', hex: '#eccc68' },
  'ON_HOLD':         { css: 'on-hold',   label: 'hold',    color: 'var(--orange)', hex: '#ff9f43' },
  'CLOSED':          { css: 'closed',    label: 'closed',  color: 'var(--red)',    hex: '#ff6b81' },
};
const DEFAULT_STATUS_INFO = { css: 'closed', label: 'closed', color: 'var(--red)', hex: '#ff6b81' };

function statusInfo(status) { return STATUS_INFO[status] || DEFAULT_STATUS_INFO; }
function statusClass(status) { return statusInfo(status).css; }
function statusLabel(status) { return statusInfo(status).label; }
function statusHex(status) { return statusInfo(status).hex; }

function isRunning(status) {
  return status === 'OPERATING' || status === 'OPERATION_SLOWED';
}

function fmtDuration(mins) {
  if (mins < 60) return mins + 'm';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? h + 'h' : h + 'h' + m + 'm';
}

function waitClass(minutes) {
  if (minutes <= 5) return 'wait-low';
  if (minutes <= 15) return 'wait-mid';
  return 'wait-high';
}

// =====================================================
// Time utilities (timezone-aware)
// =====================================================
function to24(s) {
  const m = s.match(/(\d+)(?::(\d+))?\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] || '00';
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return String(h).padStart(2, '0') + ':' + min;
}

function resortNow(timezone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hourCycle: 'h23', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date());
  return { h: parseInt(parts.find(p => p.type === 'hour').value), m: parseInt(parts.find(p => p.type === 'minute').value) };
}

function resortNowMinutes(timezone) { const { h, m } = resortNow(timezone); return h * 60 + m; }
function toMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }

function fmtTime(t) {
  const [h, m] = typeof t === 'string' ? t.split(':').map(Number) : [t.h, t.m];
  const hr = h % 12 || 12;
  const suffix = h < 12 ? 'a' : 'p';
  return `${hr}:${String(m).padStart(2,'0')}${suffix}`;
}

const CLOSING_SOON_MIN = 90;
const PAST_CLOSE_PLAN_MIN = 60;

// =====================================================
// Two-column display logic (status + wait)
// =====================================================
//
// Three layers:
//
// 1. computeLiftDisplay(lift, adapter) — SEMANTIC layer
//    Decides *what* to communicate about a lift based on its API status,
//    time-of-day, and wait data.  Returns raw {statusText, statusCls,
//    waitText, waitCls}.  All status decisions live here.
//
// 2. computeRenderedColumns(display, hasAnyWait) — LAYOUT layer
//    Decides *where* content goes (left column, right column, or both).
//    Strips the "opens " prefix when a time stands alone — the prefix
//    is only needed when a status label appears alongside wait data.
//    No status decisions here, only positional logic.
//
// 3. renderLifts DOM code — RENDER layer
//    Creates HTML elements from the layout output.  No logic.

function computeLiftDisplay(lift, adapter) {
  const scheduled = lift.scheduled;
  const wait = lift.waitMinutes;
  const start = lift.start_time;
  const end = lift.end_time;
  const status = lift.status;

  const nowMin = resortNowMinutes(adapter.timezone);
  const startMin = start ? toMin(start) : null;
  const endMin = end ? toMin(end) : null;
  const beforeOpen = startMin !== null && nowMin < startMin;
  const pastClose = endMin !== null && nowMin >= endMin;
  const wellPastClose = endMin !== null && (nowMin - endMin) > PAST_CLOSE_PLAN_MIN;
  const closingSoon = isRunning(status) && endMin !== null && !pastClose && (endMin - nowMin) <= CLOSING_SOON_MIN;
  const minsLeft = endMin !== null ? Math.max(0, endMin - nowMin) : null;

  // --- Reusable micro-results ---
  const OPEN       = { statusText: 'open',    statusCls: 'operating' };
  const CLOSED     = { statusText: 'closed',  statusCls: 'closed' };
  const HOLD       = { statusText: 'hold',    statusCls: 'on-hold' };
  const OPENS_AT   = start ? { statusText: 'opens ' + fmtTime(start), statusCls: 'opens' } : CLOSED;
  const CLEAR_WAIT = { waitText: '', waitCls: '' };
  let detailText = '';

  // Show "opens Xa" when we're clearly outside operating hours
  const showOpensAt = (beforeOpen || wellPastClose) && start;

  // --- Wait column defaults (overridden below for non-operating states) ---
  let waitOut;
  if (wait === null)  waitOut = CLEAR_WAIT;
  else if (wait === 0) waitOut = { waitText: '0m', waitCls: 'wait-low' };
  else waitOut = { waitText: wait + 'm', waitCls: waitClass(wait) };

  // --- Status logic ---
  let statusOut;

  if (status === 'ON_HOLD') {
    statusOut = HOLD;
    waitOut = CLEAR_WAIT;

  } else if (status === 'CLOSED' && !scheduled) {
    statusOut = showOpensAt ? OPENS_AT : CLOSED;
    waitOut = CLEAR_WAIT;

  } else if (status === 'CLOSED' && scheduled) {
    const pastOpen = startMin !== null && nowMin >= startMin;
    statusOut = (!pastClose && pastOpen) ? { statusText: 'delayed?', statusCls: 'delayed' } : OPENS_AT;
    // Keep computed waitOut (Scheduled can still have wait data from API)

  } else if (isRunning(status)) {
    if (closingSoon)           statusOut = { statusText: 'closes in ' + fmtDuration(minsLeft), statusCls: 'closing-soon', statusColumn: true };
    else if (pastClose)      { statusOut = OPEN; waitOut = CLEAR_WAIT; if (end) detailText = 'closed at ' + fmtTime(end); }
    else if (wait != null)     statusOut = { statusText: '', statusCls: '' };
    else                       statusOut = OPEN;

  } else if (status === 'STANDBY') {
    statusOut = showOpensAt ? OPENS_AT : { statusText: 'standby', statusCls: 'standby' };
    waitOut = CLEAR_WAIT;

  } else {
    statusOut = CLOSED;
    waitOut = CLEAR_WAIT;
  }

  return { ...statusOut, ...waitOut, detailText };
}

// LAYOUT layer: merge two-column semantic output into visual positions.
// When a single piece of info exists, it goes in the rightmost column.
// "opens 8:30a" becomes just "8:30a" when shown alone (the prefix is
// only useful as a label alongside a wait value).
// "closes in X" stays in the left (status) column when the resort has
// wait data, so all closing-soon labels align regardless of per-lift wait.
function computeRenderedColumns(display, hasAnyWait) {
  const stripOpens = t => t.startsWith('opens ') ? t.slice(6) : t;

  if (display.statusText && display.waitText) {
    // Both columns have content — use both positions
    return { left: display.statusText, leftCls: display.statusCls, right: display.waitText, rightCls: display.waitCls };
  }
  // Status flagged as statusColumn (e.g. "closes in X") stays in the left column
  // so it aligns with other lifts that show status + wait side by side.
  if (hasAnyWait && display.statusColumn) {
    return { left: display.statusText, leftCls: display.statusCls, right: '', rightCls: '' };
  }
  // Single piece of info → right column only
  const text = display.waitText || display.statusText;
  const cls = display.waitText ? display.waitCls : display.statusCls;
  return { left: '', leftCls: '', right: stripOpens(text), rightCls: cls };
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

// =====================================================
// Data hash & change detection (normalized structure)
// =====================================================
function dataHash(data) {
  const parts = [];
  for (const sr of data.subResorts) {
    if (sr.lifts) sr.lifts.forEach(l => parts.push(l.id + ':' + l.status));
    if (sr.weather) sr.weather.forEach(w => parts.push(w.name + ':' + w.temperature + ':' + w.snow_accumulation));
  }
  return parts.join('|');
}

function detectChanges(newData) {
  if (!previousData) return;
  const now = Date.now();
  for (const sr of newData.subResorts) {
    if (!sr.lifts) continue;
    const prevSr = previousData.subResorts.find(p => p.id === sr.id);
    if (!prevSr || !prevSr.lifts) continue;
    for (const lift of sr.lifts) {
      const prevLift = prevSr.lifts.find(p => p.id === lift.id);
      if (prevLift && prevLift.status !== lift.status) {
        changeLog.push({ time: now, resort: sr.name, lift: lift.name, from: statusLabel(prevLift.status), to: statusLabel(lift.status) });
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

// =====================================================
// Weather helpers
// =====================================================
const JP_EN = {
  '吹雪': 'Snow Storm', '雪': 'Snow', '曇り': 'Cloudy', '晴れ': 'Clear',
  '粉雪': 'Powder Snow', '圧雪': 'Packed Powder', '湿雪': 'Wet Snow',
  '全面可能': 'All Courses Open', '一部可能': 'Partial Open', '閉鎖': 'Closed',
  'なし': '\u2014',
};
function tr(s) { return s ? (JP_EN[s] || s) : '\u2014'; }

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

// =====================================================
// Render: Weather (normalized)
// =====================================================
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
    temp.textContent = s.temperature != null ? `${cToF(s.temperature)}\u00B0F` : '\u2014';
    const cond = document.createElement('div');
    cond.className = 'wx-condition';
    cond.textContent = `${wxIcon(tr(s.weather))} ${tr(s.weather)}`;
    station.appendChild(h4);
    station.appendChild(temp);
    station.appendChild(cond);
    station.appendChild(createWxRow('Snow', s.snow_accumulation != null ? `${cmToIn(s.snow_accumulation)}" (${s.snow_accumulation}cm)` : '\u2014'));
    station.appendChild(createWxRow('24h New', s.snow_accumulation_difference != null ? `${cmToIn(s.snow_accumulation_difference)}" (${s.snow_accumulation_difference}cm)` : '\u2014'));
    station.appendChild(createWxRow('Condition', tr(s.snow_state)));
    station.appendChild(createWxRow('Wind', s.wind_speed || '\u2014'));
    station.appendChild(createWxRow('Courses', tr(s.cource_state)));
    return station;
  }

  for (const sr of data.subResorts) {
    if (!sr.weather) continue;

    const card = document.createElement('div');
    card.className = 'weather-card';
    const h3 = document.createElement('h3');
    h3.textContent = sr.name;
    card.appendChild(h3);

    const wd = sr.weather;
    if (wd.length === 0) {
      const p = document.createElement('p');
      p.style.color = 'var(--text-dim)';
      p.textContent = 'No data';
      card.appendChild(p);
    } else if (wd.length === 1) {
      const stations = document.createElement('div');
      stations.className = 'wx-stations';
      stations.appendChild(createStation('Conditions', wd[0]));
      card.appendChild(stations);
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
  }

  container.innerHTML = '';
  container.appendChild(grid);
}

// =====================================================
// Render: Lifts (normalized)
// =====================================================
function renderLifts(data) {
  const content = document.getElementById('lifts-content');
  const resorts = document.createElement('div');
  resorts.className = 'resorts';
  const adapter = getActiveAdapter();
  const hasAnyWait = data.subResorts.some(sr => (sr.lifts || []).some(l => l.waitMinutes != null));

  for (const sr of data.subResorts) {
    const card = document.createElement('div');
    card.className = 'resort-card';

    if (!sr.lifts) {
      const header = document.createElement('div');
      header.className = 'resort-header';
      const h2 = document.createElement('h2');
      h2.textContent = sr.name;
      const stats = document.createElement('span');
      stats.className = 'resort-stats';
      stats.textContent = 'Error';
      header.appendChild(h2);
      header.appendChild(stats);
      card.appendChild(header);
      resorts.appendChild(card);
      continue;
    }

    const lifts = [...sr.lifts].sort((a, b) => a.name.localeCompare(b.name));
    const open = lifts.filter(l => isRunning(l.status)).length;
    const updated = latestUpdateDate(lifts);
    const agoText = updated ? timeAgo(updated) : '';

    const header = document.createElement('div');
    header.className = 'resort-header';
    const h2 = document.createElement('h2');
    h2.textContent = sr.name;
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
      info.appendChild(name);
      info.appendChild(detail);

      // Two-column display (status + wait + subtitle)
      const display = computeLiftDisplay(l, adapter);
      detail.textContent = display.detailText;
      row.appendChild(info);

      const cols = computeRenderedColumns(display, hasAnyWait);
      if (hasAnyWait) {
        const statusEl = document.createElement('div');
        statusEl.className = 'lift-status-text ' + cols.leftCls;
        statusEl.textContent = cols.left;
        row.appendChild(statusEl);
        const waitEl = document.createElement('div');
        waitEl.className = 'lift-wait ' + cols.rightCls;
        waitEl.textContent = cols.right;
        row.appendChild(waitEl);
      } else {
        const statusEl = document.createElement('div');
        statusEl.className = 'lift-status-text ' + cols.rightCls;
        statusEl.textContent = cols.right;
        row.appendChild(statusEl);
      }

      // Expandable detail panel
      const expand = document.createElement('div');
      expand.className = 'lift-expand';
      const wait = l.waitMinutes;
      const bits = [];
      if (l.start_time && l.end_time) bits.push(`${fmtTime(l.start_time)} – ${fmtTime(l.end_time)}`);
      if (l.liftType) {
        const typeName = l.liftType.charAt(0).toUpperCase() + l.liftType.slice(1);
        bits.push(l.capacity ? `${typeName} · ${l.capacity} seats` : typeName);
      }
      if (wait != null && wait > 0) bits.push(`${wait}m wait`);
      if (l.comment) bits.push(l.comment);
      if (l.updateDate) bits.push(`Updated ${timeAgo(l.updateDate)}`);
      expand.textContent = bits.join(' · ');
      row.appendChild(expand);

      row.addEventListener('click', () => {
        row.classList.toggle('expanded');
      });

      liftList.appendChild(row);
    });
    card.appendChild(liftList);
    resorts.appendChild(card);
  }

  content.innerHTML = '';
  content.appendChild(resorts);

  // Summary bar
  const allLifts = data.subResorts.flatMap(sr => sr.lifts || []);
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

// =====================================================
// Meta / status bar
// =====================================================
function updateMeta(error) {
  const lastUpdate = document.getElementById('last-update');
  const adapter = getActiveAdapter();
  if (error) {
    lastUpdate.textContent = 'Update failed';
    lastUpdate.style.color = 'var(--red)';
  } else {
    lastUpdate.style.color = '';
    lastUpdate.textContent = `Updated ${fmtTime(resortNow(adapter.timezone))}`;
  }
}

// =====================================================
// Refresh loop
// =====================================================
async function refresh() {
  fetchCount++;
  const gen = refreshGeneration;
  const adapter = getActiveAdapter();
  const errorBanner = document.getElementById('error-banner');
  try {
    const data = await adapter.fetchData();
    if (gen !== refreshGeneration) return; // resort switched during fetch, discard
    if (fetchCount > 1) detectChanges(data);
    previousData = data;
    latestData = data;
    const hash = dataHash(data);
    if (hash !== lastRenderedHash || changeLog.length > 0) {
      lastRenderedHash = hash;
      renderLifts(data);
      if (adapter.capabilities.weather) renderWeather(data);
      renderChanges();
      if (adapter.capabilities.interactiveMap && adapter.updateMapLifts) {
        adapter.updateMapLifts(data);
      }
    }
    updateMeta(false);
    errorBanner.classList.remove('visible');
    consecutiveFailures = 0;
  } catch (e) {
    updateMeta(true);
    console.error('Refresh failed:', e);
    errorBanner.textContent = 'Unable to update lift data. Will retry shortly.';
    errorBanner.classList.add('visible');
    consecutiveFailures++;
  }
  const backoff = Math.min(REFRESH_INTERVAL_MS * Math.pow(2, consecutiveFailures), 600000);
  refreshTimer = setTimeout(refresh, consecutiveFailures > 0 ? backoff : REFRESH_INTERVAL_MS);
}

// =====================================================
// Init
// =====================================================
async function init() {
  // URL routing: check pathname for resort ID
  const path = window.location.pathname.replace(/^\//, '').toLowerCase();
  if (path && RESORT_ADAPTERS[path]) {
    activeResortId = path;
    localStorage.setItem('ski-active-resort', path);
  }

  const adapter = getActiveAdapter();

  updateHeader();
  updateTabVisibility();
  renderSettings();
  refresh();
}

window.addEventListener('popstate', () => {
  const path = window.location.pathname.replace(/^\//, '').toLowerCase();
  if (path && RESORT_ADAPTERS[path] && path !== activeResortId) {
    switchResort(path, true);
  }
});

init();
