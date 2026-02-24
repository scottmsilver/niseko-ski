#!/usr/bin/env bash
# ===========================================================================
# Integration tests for the ski lifts scraper + frontend
#
# Usage:
#   bash test.sh                  # test against Incus container (default)
#   bash test.sh localhost:9090   # test against Docker container
#   bash test.sh localhost:3000   # test scraper directly (no nginx)
#
# Exit codes: 0 = all passed, 1 = failures
# ===========================================================================
set -uo pipefail

BASE="${1:-10.182.70.241}"
# Add http:// if no protocol
[[ "$BASE" =~ ^http ]] || BASE="http://$BASE"

PASS=0
FAIL=0
SKIP=0
ERRORS=""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
red()    { printf '\033[31m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

pass() { PASS=$((PASS + 1)); green "  PASS: $1"; }
fail() { FAIL=$((FAIL + 1)); red "  FAIL: $1"; ERRORS="${ERRORS}\n  - $1"; }
skip() { SKIP=$((SKIP + 1)); yellow "  SKIP: $1"; }

assert_status() {
  local label="$1" url="$2" expected="$3" timeout="${4:-10}"
  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' --max-time "$timeout" "$url" 2>/dev/null)
  if [ "$status" = "$expected" ]; then
    pass "$label (HTTP $status)"
  else
    fail "$label — expected $expected, got $status"
  fi
}

assert_content_type() {
  local label="$1" url="$2" expected_pattern="$3" timeout="${4:-10}"
  local ct
  ct=$(curl -s -o /dev/null -w '%{content_type}' --max-time "$timeout" "$url" 2>/dev/null || echo "")
  if echo "$ct" | grep -qi "$expected_pattern"; then
    pass "$label (Content-Type: $ct)"
  else
    fail "$label — expected Content-Type matching '$expected_pattern', got '$ct'"
  fi
}

assert_size_above() {
  local label="$1" url="$2" min_bytes="$3" timeout="${4:-10}"
  local size
  size=$(curl -s -o /dev/null -w '%{size_download}' --max-time "$timeout" "$url" 2>/dev/null || echo "0")
  if [ "$size" -gt "$min_bytes" ] 2>/dev/null; then
    pass "$label (${size} bytes)"
  else
    fail "$label — expected >${min_bytes} bytes, got ${size}"
  fi
}

assert_json_key() {
  local label="$1" url="$2" key="$3" timeout="${4:-10}"
  local body
  body=$(curl -s --max-time "$timeout" "$url" 2>/dev/null || echo "")
  if echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); assert '$key' in d" 2>/dev/null; then
    pass "$label"
  else
    fail "$label — key '$key' not found in JSON response"
  fi
}

assert_cached_faster() {
  local label="$1" url="$2" max_cached_ms="$3" timeout="${4:-10}"
  # First request (warm cache)
  curl -s -o /dev/null --max-time "$timeout" "$url" 2>/dev/null
  # Second request (should be cached)
  local time_s
  time_s=$(curl -s -o /dev/null -w '%{time_total}' --max-time "$timeout" "$url" 2>/dev/null || echo "999")
  local time_ms
  time_ms=$(echo "$time_s" | awk "{printf \"%d\", \$1 * 1000}")
  if [ "$time_ms" -lt "$max_cached_ms" ] 2>/dev/null; then
    pass "$label (${time_ms}ms)"
  else
    fail "$label — expected <${max_cached_ms}ms, got ${time_ms}ms"
  fi
}

assert_html_contains() {
  local label="$1" url="$2" pattern="$3" timeout="${4:-10}"
  local body
  body=$(curl -s --max-time "$timeout" "$url" 2>/dev/null || echo "")
  if echo "$body" | grep -qi "$pattern"; then
    pass "$label"
  else
    fail "$label — pattern '$pattern' not found in response"
  fi
}

# ===========================================================================
echo ""
echo "========================================="
echo " Running tests against: $BASE"
echo "========================================="
echo ""

# ===========================================================================
# 1. HEALTH & BASIC ENDPOINTS
# ===========================================================================
echo "--- Health & basic endpoints ---"
assert_status   "Health endpoint returns 200"     "$BASE/health"  "200"
assert_json_key "Health returns {ok: true}"        "$BASE/health"  "ok"
assert_status   "Resorts endpoint returns 200"     "$BASE/resorts" "200"
assert_status   "Unknown resort terrain returns 404"  "$BASE/api/vail/fakemountain/terrain" "404"

# ===========================================================================
# 2. FRONTEND
# ===========================================================================
echo ""
echo "--- Frontend ---"
assert_status       "Index page returns 200"             "$BASE/"            "200"
assert_html_contains "Index has app.js script tag"        "$BASE/"            "app.js"
assert_html_contains "Index has trail-map-img element"    "$BASE/"            "trail-map-img"
assert_html_contains "Index has generic alt text"         "$BASE/"            'alt=\"Trail Map\"'
assert_status       "app.js returns 200"                  "$BASE/app.js"      "200"
assert_status       "style.css returns 200"               "$BASE/style.css"   "200"
assert_status       "Niseko bundled trail-map.jpg exists"  "$BASE/trail-map.jpg" "200"
assert_size_above   "trail-map.jpg is > 100KB"            "$BASE/trail-map.jpg" "100000"

# Verify app.js has generic initTrailMap (not Niseko-specific)
echo ""
echo "--- app.js code verification ---"
APP_JS_FILE=$(mktemp)
curl -s --max-time 5 "$BASE/app.js" > "$APP_JS_FILE" 2>/dev/null
if grep -q 'function initTrailMap' "$APP_JS_FILE"; then
  pass "app.js has generic initTrailMap()"
else
  fail "app.js missing generic initTrailMap()"
fi
if grep -q 'initNisekoTrailMap' "$APP_JS_FILE"; then
  fail "app.js still references initNisekoTrailMap (should be removed)"
else
  pass "app.js does not reference initNisekoTrailMap"
fi
if grep -q '_trailMapAbort' "$APP_JS_FILE"; then
  pass "app.js has AbortController cleanup (_trailMapAbort)"
else
  fail "app.js missing AbortController cleanup"
fi
if grep -q 'ski-trail-state-' "$APP_JS_FILE"; then
  pass "app.js uses per-resort localStorage key (ski-trail-state-{id})"
else
  fail "app.js missing per-resort localStorage key"
fi
TRAIL_TRUE_COUNT=$(grep -c 'trailMap: true' "$APP_JS_FILE" || true)
if [ "$TRAIL_TRUE_COUNT" -ge 3 ]; then
  pass "app.js has trailMap: true in $TRAIL_TRUE_COUNT adapters"
else
  fail "app.js has trailMap: true in only $TRAIL_TRUE_COUNT adapters (expected >= 3)"
fi
if grep -q "trail-map.jpg" "$APP_JS_FILE"; then
  pass "app.js routes Niseko to bundled trail-map.jpg"
else
  fail "app.js missing Niseko bundled image routing"
fi
if grep -q 'api/trailmap' "$APP_JS_FILE"; then
  pass "app.js routes other resorts to /api/trailmap/{id}"
else
  fail "app.js missing /api/trailmap/ routing for non-Niseko resorts"
fi
rm -f "$APP_JS_FILE"

# ===========================================================================
# 3. RESORT ROUTING (SPA catch-all)
# ===========================================================================
echo ""
echo "--- SPA routing ---"
assert_status "Niseko route returns 200"        "$BASE/niseko"        "200"
assert_status "Breckenridge route returns 200"   "$BASE/breckenridge"  "200"
assert_status "Park City route returns 200"      "$BASE/parkcity"      "200"
assert_status "Alta route returns 200"           "$BASE/alta"          "200"
assert_status "Snowbird route returns 200"       "$BASE/snowbird"      "200"

# ===========================================================================
# 4. LIFT DATA APIs
# ===========================================================================
echo ""
echo "--- Lift data APIs ---"

# Niseko (direct yukiyama proxy)
assert_status "Niseko lifts API returns 200"  "$BASE/api/niseko/lifts?skiareaId=390"  "200" 15

# Alta (scraper HTML extraction)
assert_status "Alta API returns 200"           "$BASE/api/alta"   "200" 20

# Snowbird (CORS proxy)
assert_status "Snowbird lifts API returns 200" "$BASE/api/snowbird/lifts" "200" 15

# Vail resorts (Puppeteer scraper — may take time on first request)
assert_status "Vail terrain scraper returns 200" "$BASE/api/vail/breckenridge/terrain" "200" 45

# ===========================================================================
# 5. TRAIL MAP IMAGES
# ===========================================================================
echo ""
echo "--- Trail map images ---"

# Breckenridge (Vail resort — Puppeteer discovery + scene7 image)
assert_status       "Breck trail map returns 200"          "$BASE/api/trailmap/breckenridge"  "200" 60
assert_content_type "Breck trail map is image/*"           "$BASE/api/trailmap/breckenridge"  "image" 10
assert_size_above   "Breck trail map > 100KB"              "$BASE/api/trailmap/breckenridge"  "100000" 10

# Alta (static Cloudinary URL)
assert_status       "Alta trail map returns 200"           "$BASE/api/trailmap/alta"          "200" 30
assert_content_type "Alta trail map is image/*"            "$BASE/api/trailmap/alta"          "image" 10
assert_size_above   "Alta trail map > 100KB"               "$BASE/api/trailmap/alta"          "100000" 10

# Snowbird (CMS image)
assert_status       "Snowbird trail map returns 200"       "$BASE/api/trailmap/snowbird"      "200" 30
assert_content_type "Snowbird trail map is image/*"        "$BASE/api/trailmap/snowbird"      "image" 10
assert_size_above   "Snowbird trail map > 100KB"           "$BASE/api/trailmap/snowbird"      "100000" 10

# Park City (Vail resort — scene7 img discovery, not PDF-based)
assert_status       "Park City trail map returns 200"      "$BASE/api/trailmap/parkcity"      "200" 60
assert_content_type "Park City trail map is image/*"       "$BASE/api/trailmap/parkcity"      "image" 10
assert_size_above   "Park City trail map > 100KB"          "$BASE/api/trailmap/parkcity"      "100000" 10

# Niseko (no server-side trail map — uses bundled image on frontend)
assert_status "Niseko trail map returns 404"               "$BASE/api/trailmap/niseko"        "404" 5

# Unknown resort
assert_status "Unknown resort trail map returns 404"       "$BASE/api/trailmap/fakemountain"  "404" 5

# ===========================================================================
# 6. TRAIL MAP CACHING
# ===========================================================================
echo ""
echo "--- Trail map caching ---"
# Breck should already be cached from tests above
assert_cached_faster "Breck trail map cached response < 500ms"  "$BASE/api/trailmap/breckenridge"  500  5
assert_cached_faster "Alta trail map cached response < 500ms"   "$BASE/api/trailmap/alta"          500  5

# ===========================================================================
# 7. NGINX CONFIG VERIFICATION
# ===========================================================================
echo ""
echo "--- Nginx routing ---"
# Verify trail map proxy passes through correctly (Cache-Control header)
CACHE_HEADER=$(curl -s -I --max-time 5 "$BASE/api/trailmap/breckenridge" 2>/dev/null | grep -i 'cache-control' || echo "")
if echo "$CACHE_HEADER" | grep -qi "max-age"; then
  pass "Trail map response has Cache-Control header"
else
  fail "Trail map response missing Cache-Control header"
fi

# ===========================================================================
# 8. TAB-BASED URL ROUTING
# ===========================================================================
echo ""
echo "--- Tab-based URL routing ---"
assert_status "Resort+tab route /niseko/lifts returns 200"        "$BASE/niseko/lifts"        "200"
assert_status "Resort+tab route /breckenridge/trail returns 200"  "$BASE/breckenridge/trail"  "200"
assert_status "Resort+tab route /alta/weather returns 200"        "$BASE/alta/weather"        "200"
assert_status "Resort+tab route /niseko/settings returns 200"     "$BASE/niseko/settings"     "200"
assert_status "Resort+tab route /parkcity/map returns 200"        "$BASE/parkcity/map"        "200"

# ===========================================================================
# 9. LIFT DATA INTEGRITY
# ===========================================================================
echo ""
echo "--- Lift data integrity ---"

# Niseko: check for "undefinedm" bug (waitMinutes missing → "undefinedm" in display)
assert_html_contains "Niseko API has lifts array"      "$BASE/api/niseko/lifts?skiareaId=390" "name" 15
NISEKO_BODY=$(curl -s --max-time 15 "$BASE/api/niseko/lifts?skiareaId=390" 2>/dev/null || echo "")
if echo "$NISEKO_BODY" | grep -q 'undefined'; then
  fail "Niseko API contains 'undefined' string (likely missing field)"
else
  pass "Niseko API has no 'undefined' values"
fi

# Alta: check response has lift data
ALTA_BODY=$(curl -s --max-time 20 "$BASE/api/alta" 2>/dev/null || echo "")
if echo "$ALTA_BODY" | grep -q '"lifts"'; then
  pass "Alta API returns lifts data"
else
  fail "Alta API missing lifts data"
fi
if echo "$ALTA_BODY" | grep -q 'undefined'; then
  fail "Alta API contains 'undefined' string"
else
  pass "Alta API has no 'undefined' values"
fi

# ===========================================================================
# 10. DISPLAY ENDPOINT
# ===========================================================================
echo ""
echo "--- Display endpoint (server-vended display instructions) ---"

assert_status "Display endpoint /display/alta returns 200"    "$BASE/api/display/alta"    "200" 20
assert_status "Display endpoint /display/niseko returns 200"  "$BASE/api/display/niseko"  "200" 15
assert_status "Display endpoint /display/snowbird returns 200" "$BASE/api/display/snowbird" "200" 20

# Check that display data contains expected fields
DISPLAY_BODY=$(curl -s --max-time 20 "$BASE/api/display/alta" 2>/dev/null || echo "")
if echo "$DISPLAY_BODY" | grep -q '"display"'; then
  pass "Display endpoint returns display field on lifts"
else
  fail "Display endpoint missing display field"
fi
if echo "$DISPLAY_BODY" | grep -q '"rightCls"'; then
  pass "Display data includes rendered column classes"
else
  fail "Display data missing rendered column classes"
fi
if echo "$DISPLAY_BODY" | grep -q '"subResorts"'; then
  pass "Display endpoint returns subResorts structure"
else
  fail "Display endpoint missing subResorts structure"
fi

assert_status "Display endpoint unknown resort returns 404"   "$BASE/api/display/fakesort" "404" 5

# ===========================================================================
# 11. WEATHER ENDPOINT
# ===========================================================================
echo ""
echo "--- Weather endpoint (server-vended weather stations) ---"

assert_status "Weather /weather/niseko returns 200"     "$BASE/api/weather/niseko"     "200" 15
assert_status "Weather /weather/heavenly returns 200"   "$BASE/api/weather/heavenly"   "200" 15
assert_status "Weather /weather/alta returns 200"       "$BASE/api/weather/alta"       "200" 5
assert_status "Weather /weather/snowbird returns 200"   "$BASE/api/weather/snowbird"   "200" 5
assert_status "Weather unknown returns 404"             "$BASE/api/weather/fakesort"   "404" 5

# Validate structure
assert_html_contains "Weather niseko has stations"      "$BASE/api/weather/niseko"     "stations" 15
assert_html_contains "Weather heavenly has stations"    "$BASE/api/weather/heavenly"   "stations" 15

# Alta/Snowbird return empty subResorts (no weather capability)
assert_html_contains "Weather alta has subResorts"      "$BASE/api/weather/alta"       "subResorts" 5
assert_html_contains "Weather snowbird has subResorts"  "$BASE/api/weather/snowbird"   "subResorts" 5

# ===========================================================================
# 12. ERROR HANDLING
# ===========================================================================
echo ""
echo "--- Error handling ---"
assert_status "Trailing slash on health still works"   "$BASE/health/"  "200"
assert_status "Unknown top-level path returns 200 (SPA fallback)"  "$BASE/doesnotexist"  "200"

# ===========================================================================
# SUMMARY
# ===========================================================================
echo ""
echo "========================================="
TOTAL=$((PASS + FAIL + SKIP))
echo " Results: $PASS passed, $FAIL failed, $SKIP skipped ($TOTAL total)"
echo "========================================="

if [ "$FAIL" -gt 0 ]; then
  echo ""
  red "Failures:$ERRORS"
  echo ""
  exit 1
else
  echo ""
  green "All tests passed!"
  echo ""
  exit 0
fi
