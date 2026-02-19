# Niseko United Lift Status

A mobile-first web app for real-time lift status, weather, and trail maps across all four Niseko United resorts: Hanazono, Grand Hirafu, Annupuri, and Niseko Village.

Live at **https://niseko-ski.fly.dev/**

## Features

### Lifts Tab
- Real-time lift status for all resorts, pulled from the yukiyama.biz API every 2 minutes
- Status categories: Open, Slowed, Standby, On Hold, Closed
- Operating hours shown per lift, with "til X" when currently running
- Change detection: highlights lifts that changed status in the last 10 minutes with a banner showing what changed and when

### Weather Tab
- Summit and base station weather for each resort
- Temperature (F and C), snow accumulation (inches and cm), snow condition, wind, and course status
- Japanese weather terms auto-translated to English

### Trail Map Tab
- Official Niseko United trail map with full zoom/pan support
- Pinch-to-zoom and drag on mobile, scroll-wheel zoom on desktop
- Double-tap to zoom in; +/- buttons and fit-to-screen control
- Image served locally with 7-day cache headers

### Interactive Map Tab
- MapLibre GL topographic map with hand-drawn pencil-sketch style
- Live-colored lift lines (color = current status)
- Contour lines generated from DEM elevation tiles via custom `pencil://` protocol
- Shaded relief overlay

## Architecture

Single-page static app — no build step, no framework, no server-side logic.

### Data Flow

```
yukiyama.biz API ──> fetchResortData() ──> fetchAllData()
                                              │
                      ┌───────────────────────┤
                      ▼                       ▼
               renderLifts()           renderWeather()
                      │
                      ▼
              updateMapLifts() ──> MapLibre GL (live lift colors)
                      │
                      ▼
              detectChanges() ──> renderChanges() (change banner)
```

### API

All data comes from the yukiyama.biz public web API (`web-api.yukiyama.biz/web-api`):

- **Lift status**: `latest-facility/backward?facilityType=lift&lang=en&skiareaId={id}`
- **Weather**: `latest-weather/backward?lang=en&skiareaId={id}`

Resort IDs: Hanazono=379, Grand Hirafu=390, Annupuri=393, Niseko Village=394.

The `fetchResortData()` helper fetches all resorts for a given endpoint in parallel, with per-resort error isolation (one resort failing doesn't break the others).

### Status System

A single `STATUS_INFO` config map drives all status display logic — CSS class, human label, CSS color variable, and hex color for map markers:

```
API status string  →  STATUS_INFO[status]  →  { css, label, color, hex }
                                                  ↓       ↓        ↓
                                              CSS class  UI text  map color
```

### Map Rendering

The interactive map uses a custom MapLibre protocol (`pencil://`) that:
1. Fetches Terrarium-format DEM tiles from AWS
2. Decodes elevation data
3. Renders shaded relief and contour lines (50m minor, 200m major) onto a canvas
4. Returns the canvas as a raster tile

Lift GeoJSON coordinates and a Japanese→English name mapping are embedded in the app. Lift line colors update in real-time from the API data.

## Deployment

Deployed on [Fly.io](https://fly.io) in the Tokyo (nrt) region using Nginx Alpine.

```bash
# Deploy
flyctl deploy

# Check status
flyctl status
```

### Files

| File | Purpose |
|------|---------|
| `index.html` | Page markup only |
| `style.css` | All styles |
| `app.js` | Application logic (API, rendering, map, trail viewer) |
| `data/lifts.geojson` | Lift line coordinates and metadata |
| `data/runs.geojson` | Ski run coordinates and metadata |
| `trail-map.jpg` | Bundled trail map image (served with 7d cache) |
| `Dockerfile` | Nginx Alpine container config |
| `nginx.conf` | Cache headers for static assets |
| `fly.toml` | Fly.io app configuration |

## Development

No build step. Serve locally with any HTTP server (required for GeoJSON fetch and trail map):

```bash
python3 -m http.server 8000
```
