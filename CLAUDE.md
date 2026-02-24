# jpski — Ski Lift Status App

## Goals

### Server-side consolidation (reduce web/Android duplication)

The server already vends pre-computed display data (`/api/display/{slug}`) and weather
(`/api/weather/{slug}`). Both web and Android clients carry fallback implementations that
duplicate server logic. Goal: make the server the single source of truth and strip client
fallback code.

| Duplicated thing | Web (app.js) | Android | Server (scraper) | Action |
|---|---|---|---|---|
| Resort config (IDs, names, timezones, capabilities, sub-resorts) | RESORT_ADAPTERS | Models.kt | shared-constants.json | Add `/api/config/resorts` endpoint; clients fetch on startup |
| Status maps (VAIL_STATUS_MAP, SNOWBIRD_STATUS_MAP, etc.) | Inline copies | LiftStatus enum + inline maps | shared-constants.json | Server always vends normalized status; remove client maps |
| Lift display logic (computeLiftDisplay, time calcs, closing-soon) | Uses server output | ~200 LOC fallback in LiftsScreen.kt | display.js | Guarantee `/api/display` availability; delete Android fallback |
| JP→EN weather translations | N/A (server output) | jpEn map + translate() in SkiApi.kt | shared-constants.json | Server pre-translates; remove Android map |
| Time utilities (fmtTime, toMin, nowMinutes, isPastClose) | N/A (server output) | TimeUtils.kt reimplements display.js | display.js | Remove once Android fallback is deleted |

Priority order:
1. `/api/config/resorts` — biggest win, eliminates triple-maintenance of resort lists
2. Delete Android LiftsScreen fallback (display.js logic) — ~200 lines of duplicated business logic
3. Delete Android jpEn translation map — server already translates weather
4. Remove status map copies from app.js — server normalizes before vending
