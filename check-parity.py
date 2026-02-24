#!/usr/bin/env python3
"""
Resort parity check — verify resort IDs, timezones, translations, and status
maps are consistent across the web frontend, scraper backend, and Android app.

Exit 0 if all checks pass, 1 if any mismatch.
"""

import json
import os
import re
import sys

REPO = os.path.dirname(os.path.abspath(__file__))

errors = []


def fail(msg):
    errors.append(msg)
    print(f"  FAIL: {msg}")


def ok(msg):
    print(f"  OK: {msg}")


# ---------------------------------------------------------------------------
# Load source files
# ---------------------------------------------------------------------------
with open(os.path.join(REPO, "app.js")) as f:
    app_js = f.read()

with open(os.path.join(REPO, "scraper", "shared-constants.json")) as f:
    shared = json.load(f)

with open(
    os.path.join(REPO, "android", "app", "src", "main", "java", "com", "jpski", "niseko", "data", "Models.kt")
) as f:
    models_kt = f.read()

# ---------------------------------------------------------------------------
# 1. Resort IDs
# ---------------------------------------------------------------------------
print("\n--- Resort ID parity ---")

# app.js: extract from VAIL_RESORTS array + hardcoded adapters
vail_ids_js = re.findall(r"\{ id: '([a-z]+)',", app_js)
adapter_ids_js = re.findall(r"RESORT_ADAPTERS\.([a-z]+)\s*=", app_js)
all_ids_js = sorted(set(vail_ids_js + adapter_ids_js))

# shared-constants.json: RESORT_TIMEZONES keys + niseko
all_ids_scraper = sorted(set(list(shared["RESORT_TIMEZONES"].keys()) + ["niseko"]))

# Models.kt: ResortConfig("id", ...)
all_ids_kt = sorted(set(re.findall(r'ResortConfig\("([a-z]+)"', models_kt)))

if all_ids_js == all_ids_scraper:
    ok(f"app.js and scraper match ({len(all_ids_js)} resorts)")
else:
    only_js = set(all_ids_js) - set(all_ids_scraper)
    only_scraper = set(all_ids_scraper) - set(all_ids_js)
    if only_js:
        fail(f"In app.js but not scraper: {only_js}")
    if only_scraper:
        fail(f"In scraper but not app.js: {only_scraper}")

if all_ids_js == all_ids_kt:
    ok(f"app.js and Android match ({len(all_ids_kt)} resorts)")
else:
    only_js2 = set(all_ids_js) - set(all_ids_kt)
    only_kt = set(all_ids_kt) - set(all_ids_js)
    if only_js2:
        fail(f"In app.js but not Android: {only_js2}")
    if only_kt:
        fail(f"In Android but not app.js: {only_kt}")

# ---------------------------------------------------------------------------
# 2. Timezone parity
# ---------------------------------------------------------------------------
print("\n--- Timezone parity ---")

tz_js = {}
for m in re.finditer(r"\{ id: '([a-z]+)'.*?timezone: '([^']+)'", app_js):
    tz_js[m.group(1)] = m.group(2)
# Niseko
tz_niseko = re.search(r"RESORT_ADAPTERS\.niseko\s*=\s*\{[^}]*timezone:\s*'([^']+)'", app_js)
if tz_niseko:
    tz_js["niseko"] = tz_niseko.group(1)
# Alta, Snowbird
for name in ["alta", "snowbird"]:
    pat = rf"RESORT_ADAPTERS\.{name}\s*=\s*\{{[^}}]*timezone:\s*'([^']+)'"
    m = re.search(pat, app_js)
    if m:
        tz_js[name] = m.group(1)

tz_scraper = shared["RESORT_TIMEZONES"]

mismatches = []
for resort_id in sorted(set(tz_js.keys()) | set(tz_scraper.keys())):
    js_tz = tz_js.get(resort_id)
    sc_tz = tz_scraper.get(resort_id)
    if js_tz and sc_tz and js_tz != sc_tz:
        mismatches.append(f"{resort_id}: app.js={js_tz}, scraper={sc_tz}")

if not mismatches:
    ok(f"All timezones match ({len(tz_scraper)} resorts)")
else:
    for m in mismatches:
        fail(f"Timezone mismatch: {m}")

# ---------------------------------------------------------------------------
# 3. JP_EN translation parity
# ---------------------------------------------------------------------------
print("\n--- JP_EN translation parity ---")


def decode_js_unicode(s):
    """Decode JS \\uXXXX escapes to actual unicode characters."""
    return re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), s)


jp_en_block = re.search(r"const JP_EN\s*=\s*\{([^}]+)\}", app_js)
jp_en_js = {}
if jp_en_block:
    for m in re.finditer(r"'([^']+)':\s*'([^']*)'", jp_en_block.group(1)):
        key = m.group(1)
        jp_en_js[key] = decode_js_unicode(m.group(2))

jp_en_scraper = shared["JP_EN_WEATHER"]
if jp_en_js == jp_en_scraper:
    ok(f"JP_EN translations match ({len(jp_en_scraper)} entries)")
else:
    only_js3 = set(jp_en_js.keys()) - set(jp_en_scraper.keys())
    only_sc = set(jp_en_scraper.keys()) - set(jp_en_js.keys())
    if only_js3:
        fail(f"JP_EN keys only in app.js: {only_js3}")
    if only_sc:
        fail(f"JP_EN keys only in scraper: {only_sc}")
    for k in set(jp_en_js.keys()) & set(jp_en_scraper.keys()):
        if jp_en_js[k] != jp_en_scraper[k]:
            fail(f"JP_EN value mismatch for '{k}': app.js='{jp_en_js[k]}', scraper='{jp_en_scraper[k]}'")

# ---------------------------------------------------------------------------
# 4. Status map consistency
# ---------------------------------------------------------------------------
print("\n--- Status map parity ---")


def extract_js_map(name, source):
    m = re.search(rf"const {name}\s*=\s*\{{([^}}]+)\}}", source)
    if not m:
        return {}
    result = {}
    for pair in re.finditer(r"'([^']+)':\s*'([^']+)'", m.group(1)):
        result[pair.group(1)] = pair.group(2)
    return result


for map_name in ["VAIL_STATUS_MAP", "SNOWBIRD_STATUS_MAP", "NISEKO_STATUS_MAP"]:
    js_map = extract_js_map(map_name, app_js)
    sc_map = shared.get(map_name, {})
    if js_map == sc_map:
        ok(f"{map_name} matches ({len(sc_map)} entries)")
    else:
        fail(f"{map_name} mismatch: app.js={js_map}, scraper={sc_map}")

# ---------------------------------------------------------------------------
# 5. Android LiftStatus vs VAIL_STATUS_MAP
# ---------------------------------------------------------------------------
print("\n--- Android LiftStatus vs VAIL_STATUS_MAP ---")

vail_map_kt = {}
for m in re.finditer(r'"(\w+)"\s*->\s*(\w+)', models_kt):
    status_in = m.group(1)
    status_out = m.group(2)
    kt_to_api = {"OPERATING": "OPERATING", "CLOSED": "CLOSED", "ON_HOLD": "ON_HOLD"}
    if status_out in kt_to_api:
        vail_map_kt[status_in] = kt_to_api[status_out]

vail_map_js = shared["VAIL_STATUS_MAP"]

if vail_map_kt == vail_map_js:
    ok(f"Android fromVailStatus matches VAIL_STATUS_MAP ({len(vail_map_kt)} entries)")
else:
    fail(f"Android fromVailStatus mismatch: kt={vail_map_kt}, scraper={vail_map_js}")

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print()
if errors:
    print(f"FAILED: {len(errors)} issue(s) found")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)
else:
    print("All parity checks passed!")
    sys.exit(0)
