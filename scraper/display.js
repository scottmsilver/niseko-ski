// ---------------------------------------------------------------------------
// Lift display computation — shared by server, consumed by web + Android
//
// This module computes "what to draw" for each lift row:
//   - statusText / statusCls (semantic status)
//   - waitText / waitCls (wait column)
//   - detailText (subtitle line, e.g. "closed at 4p")
//   - Rendered two-column layout (left/right with CSS classes)
//
// All time-dependent logic lives here so clients don't re-implement it.
// ---------------------------------------------------------------------------

const CLOSING_SOON_MIN = 90;
const PAST_CLOSE_PLAN_MIN = 60;

// --- Time utilities ---

function nowMinutes(timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hourCycle: 'h23', hour: 'numeric', minute: 'numeric',
  }).formatToParts(new Date());
  const h = parseInt(parts.find(p => p.type === 'hour').value);
  const m = parseInt(parts.find(p => p.type === 'minute').value);
  return h * 60 + m;
}

function toMin(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const hr = h % 12 || 12;
  const suffix = h < 12 ? 'a' : 'p';
  return m === 0 ? `${hr}${suffix}` : `${hr}:${String(m).padStart(2, '0')}${suffix}`;
}

function fmtDuration(mins) {
  if (mins < 60) return mins + 'm';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? h + 'h' : h + 'h' + m + 'm';
}

function isRunning(status) {
  return status === 'OPERATING' || status === 'OPERATION_SLOWED';
}

function waitClass(minutes) {
  if (minutes <= 5) return 'wait-low';
  if (minutes <= 15) return 'wait-mid';
  return 'wait-high';
}

// --- Semantic layer: what to communicate about a lift ---

function computeLiftDisplay(lift, timezone, nowOverride) {
  const { status, scheduled, start_time: start, end_time: end, waitMinutes: wait } = lift;

  const now = nowOverride != null ? nowOverride : nowMinutes(timezone);
  const startMin = start ? toMin(start) : null;
  const endMin = end ? toMin(end) : null;
  const beforeOpen = startMin !== null && now < startMin;
  const pastClose = endMin !== null && now >= endMin;
  const wellPastClose = endMin !== null && (now - endMin) > PAST_CLOSE_PLAN_MIN;
  const closingSoon = isRunning(status) && endMin !== null && !pastClose && (endMin - now) <= CLOSING_SOON_MIN;
  const minsLeft = endMin !== null ? Math.max(0, endMin - now) : null;

  const OPEN       = { statusText: 'open',   statusCls: 'operating' };
  const CLOSED     = { statusText: 'closed', statusCls: 'closed' };
  const HOLD       = { statusText: 'hold',   statusCls: 'on-hold' };
  const OPENS_AT   = start ? { statusText: 'opens ' + fmtTime(start), statusCls: 'opens' } : CLOSED;
  const CLEAR_WAIT = { waitText: '', waitCls: '' };
  let detailText = '';

  const showOpensAt = (beforeOpen || wellPastClose) && start;

  // Wait column defaults
  let waitOut;
  if (wait == null)        waitOut = CLEAR_WAIT;
  else if (wait === 0)     waitOut = { waitText: '0m', waitCls: 'wait-low' };
  else                     waitOut = { waitText: wait + 'm', waitCls: waitClass(wait) };

  // Status logic
  let statusOut;
  let statusColumn = false;

  if (status === 'ON_HOLD') {
    statusOut = HOLD;
    waitOut = CLEAR_WAIT;

  } else if (status === 'CLOSED' && !scheduled) {
    statusOut = showOpensAt ? OPENS_AT : CLOSED;
    waitOut = CLEAR_WAIT;

  } else if (status === 'CLOSED' && scheduled) {
    const pastOpen = startMin !== null && now >= startMin;
    statusOut = (!pastClose && pastOpen) ? { statusText: 'delayed?', statusCls: 'delayed' } : OPENS_AT;
    waitOut = CLEAR_WAIT;

  } else if (isRunning(status)) {
    if (closingSoon) {
      statusOut = { statusText: 'closes in ' + fmtDuration(minsLeft), statusCls: 'closing-soon' };
      statusColumn = true;
    } else if (pastClose) {
      statusOut = OPEN;
      waitOut = CLEAR_WAIT;
      if (end) detailText = 'closed at ' + fmtTime(end);
    } else if (wait != null) {
      statusOut = { statusText: '', statusCls: '' };
    } else {
      statusOut = OPEN;
    }

  } else if (status === 'STANDBY') {
    statusOut = showOpensAt ? OPENS_AT : { statusText: 'standby', statusCls: 'standby' };
    waitOut = CLEAR_WAIT;

  } else {
    statusOut = CLOSED;
    waitOut = CLEAR_WAIT;
  }

  return { ...statusOut, ...waitOut, detailText, statusColumn };
}

// --- Layout layer: where content goes in two-column display ---

function computeRenderedColumns(display, hasAnyWait) {
  const stripOpens = t => t.startsWith('opens ') ? t.slice(6) : t;

  if (display.statusText && display.waitText) {
    return { left: display.statusText, leftCls: display.statusCls, right: display.waitText, rightCls: display.waitCls };
  }
  if (hasAnyWait && display.statusColumn) {
    return { left: display.statusText, leftCls: display.statusCls, right: '', rightCls: '' };
  }
  const text = display.waitText || display.statusText;
  const cls = display.waitText ? display.waitCls : display.statusCls;
  return { left: '', leftCls: '', right: stripOpens(text), rightCls: cls };
}

// --- Public API: augment a normalized lift list with display data ---

/**
 * Augment each lift in a subResorts array with a `display` field.
 * Also adds `hasAnyWait` to each sub-resort.
 *
 * @param {Array} subResorts - [{id, name, lifts: [{status, scheduled, start_time, end_time, waitMinutes, ...}]}]
 * @param {string} timezone - IANA timezone string (e.g. 'America/Denver')
 * @returns {Array} same structure with `display` on each lift and `hasAnyWait` on each sub-resort
 */
function augmentDisplay(subResorts, timezone, nowOverride) {
  for (const sr of subResorts) {
    if (!sr.lifts) continue;
    const hasAnyWait = sr.lifts.some(l => l.waitMinutes != null);
    sr.hasAnyWait = hasAnyWait;
    for (const lift of sr.lifts) {
      const semantic = computeLiftDisplay(lift, timezone, nowOverride);
      const rendered = computeRenderedColumns(semantic, hasAnyWait);
      lift.display = {
        detailText: semantic.detailText,
        left: rendered.left,
        leftCls: rendered.leftCls,
        right: rendered.right,
        rightCls: rendered.rightCls,
      };
    }
  }
  return subResorts;
}

module.exports = { augmentDisplay, computeLiftDisplay, computeRenderedColumns, fmtTime, nowMinutes };
