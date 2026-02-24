const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  fmtTime,
  nowMinutes,
  computeLiftDisplay,
  computeRenderedColumns,
  augmentDisplay,
} = require('./display.js');

// ---------------------------------------------------------------------------
// Helper: build a lift object with sensible defaults
// ---------------------------------------------------------------------------
function makeLift(overrides = {}) {
  return {
    status: 'OPERATING',
    scheduled: false,
    start_time: null,
    end_time: null,
    waitMinutes: null,
    ...overrides,
  };
}

// Fixed time (noon) used as nowOverride so tests are fully deterministic
// and never flaky regardless of when the suite runs.
const TZ = 'UTC';
const NOW = 720; // noon — 12:00

// Helper: convert minutes-since-midnight back to "HH:MM"
function minToTime(m) {
  const h = Math.floor(((m % 1440) + 1440) % 1440 / 60);
  const min = ((m % 1440) + 1440) % 1440 % 60;
  return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
}

// ---------------------------------------------------------------------------
// fmtTime
// ---------------------------------------------------------------------------
describe('fmtTime', () => {
  it('returns empty string for null/undefined', () => {
    assert.equal(fmtTime(null), '');
    assert.equal(fmtTime(undefined), '');
    assert.equal(fmtTime(''), '');
  });

  it('formats midnight', () => {
    assert.equal(fmtTime('00:00'), '12a');
  });

  it('formats morning on-the-hour', () => {
    assert.equal(fmtTime('08:00'), '8a');
  });

  it('formats morning with minutes', () => {
    assert.equal(fmtTime('08:30'), '8:30a');
  });

  it('formats noon', () => {
    assert.equal(fmtTime('12:00'), '12p');
  });

  it('formats afternoon on-the-hour', () => {
    assert.equal(fmtTime('16:00'), '4p');
  });

  it('formats afternoon with minutes', () => {
    assert.equal(fmtTime('13:15'), '1:15p');
  });

  it('formats 11:59 PM', () => {
    assert.equal(fmtTime('23:59'), '11:59p');
  });

  it('formats single-digit minutes with leading zero', () => {
    assert.equal(fmtTime('09:05'), '9:05a');
  });
});

// ---------------------------------------------------------------------------
// computeLiftDisplay — time-independent paths
// ---------------------------------------------------------------------------
describe('computeLiftDisplay — time-independent', () => {
  it('ON_HOLD always returns hold and clears wait', () => {
    const d = computeLiftDisplay(
      makeLift({ status: 'ON_HOLD', waitMinutes: 10 }),
      TZ, NOW
    );
    assert.equal(d.statusText, 'hold');
    assert.equal(d.statusCls, 'on-hold');
    assert.equal(d.waitText, '');
    assert.equal(d.waitCls, '');
  });

  it('CLOSED, not scheduled, no start_time returns closed', () => {
    const d = computeLiftDisplay(
      makeLift({ status: 'CLOSED', scheduled: false, start_time: null }),
      TZ, NOW
    );
    assert.equal(d.statusText, 'closed');
    assert.equal(d.statusCls, 'closed');
    assert.equal(d.waitText, '');
  });

  it('STANDBY, no start_time returns standby', () => {
    const d = computeLiftDisplay(
      makeLift({ status: 'STANDBY', start_time: null }),
      TZ, NOW
    );
    assert.equal(d.statusText, 'standby');
    assert.equal(d.statusCls, 'standby');
    assert.equal(d.waitText, '');
  });

  it('OPERATING, no end_time, no wait returns open', () => {
    const d = computeLiftDisplay(
      makeLift({ status: 'OPERATING', end_time: null, waitMinutes: null }),
      TZ, NOW
    );
    assert.equal(d.statusText, 'open');
    assert.equal(d.statusCls, 'operating');
    assert.equal(d.waitText, '');
  });

  it('OPERATION_SLOWED, no end_time, no wait returns open', () => {
    const d = computeLiftDisplay(
      makeLift({ status: 'OPERATION_SLOWED', end_time: null, waitMinutes: null }),
      TZ, NOW
    );
    assert.equal(d.statusText, 'open');
    assert.equal(d.statusCls, 'operating');
  });

  it('OPERATING with wait but no end_time returns empty status and wait', () => {
    const d = computeLiftDisplay(
      makeLift({ status: 'OPERATING', end_time: null, waitMinutes: 5 }),
      TZ, NOW
    );
    assert.equal(d.statusText, '');
    assert.equal(d.waitText, '5m');
    assert.equal(d.waitCls, 'wait-low');
  });

  it('OPERATING with high wait', () => {
    const d = computeLiftDisplay(
      makeLift({ status: 'OPERATING', end_time: null, waitMinutes: 20 }),
      TZ, NOW
    );
    assert.equal(d.waitText, '20m');
    assert.equal(d.waitCls, 'wait-high');
  });

  it('OPERATING with medium wait', () => {
    const d = computeLiftDisplay(
      makeLift({ status: 'OPERATING', end_time: null, waitMinutes: 10 }),
      TZ, NOW
    );
    assert.equal(d.waitText, '10m');
    assert.equal(d.waitCls, 'wait-mid');
  });

  it('OPERATING with zero wait', () => {
    const d = computeLiftDisplay(
      makeLift({ status: 'OPERATING', end_time: null, waitMinutes: 0 }),
      TZ, NOW
    );
    assert.equal(d.waitText, '0m');
    assert.equal(d.waitCls, 'wait-low');
  });

  it('unknown status returns closed and clears wait', () => {
    const d = computeLiftDisplay(
      makeLift({ status: 'BOGUS_UNKNOWN' }),
      TZ, NOW
    );
    assert.equal(d.statusText, 'closed');
    assert.equal(d.statusCls, 'closed');
    assert.equal(d.waitText, '');
  });

  it('detailText defaults to empty string', () => {
    const d = computeLiftDisplay(makeLift({ status: 'CLOSED' }), TZ, NOW);
    assert.equal(d.detailText, '');
  });
});

// ---------------------------------------------------------------------------
// computeLiftDisplay — time-dependent paths
// We construct times relative to NOW so tests pass at any clock time.
// ---------------------------------------------------------------------------
describe('computeLiftDisplay — time-dependent', () => {
  it('CLOSED scheduled, before open time shows opens-at', () => {
    // start_time 120 minutes from now (guaranteed future)
    const futureStart = minToTime(NOW + 120);
    const d = computeLiftDisplay(
      makeLift({ status: 'CLOSED', scheduled: true, start_time: futureStart }),
      TZ, NOW
    );
    assert.equal(d.statusText, 'opens ' + fmtTime(futureStart));
    assert.equal(d.statusCls, 'opens');
    assert.equal(d.waitText, '');
  });

  it('CLOSED scheduled, past open time but not past close shows delayed?', () => {
    // start_time 60 minutes ago, end_time 120 minutes from now
    const pastStart = minToTime(NOW - 60);
    const futureEnd = minToTime(NOW + 120);
    const d = computeLiftDisplay(
      makeLift({ status: 'CLOSED', scheduled: true, start_time: pastStart, end_time: futureEnd }),
      TZ, NOW
    );
    assert.equal(d.statusText, 'delayed?');
    assert.equal(d.statusCls, 'delayed');
  });

  it('CLOSED not-scheduled with start_time before open returns opens-at when well past close', () => {
    // start_time 120min from now, end_time 120min ago (well past close)
    const futureStart = minToTime(NOW + 120);
    const pastEnd = minToTime(NOW - 120);
    const d = computeLiftDisplay(
      makeLift({ status: 'CLOSED', scheduled: false, start_time: futureStart, end_time: pastEnd }),
      TZ, NOW
    );
    // wellPastClose = true (now - endMin > 60), beforeOpen = true
    // showOpensAt should be true
    assert.equal(d.statusText, 'opens ' + fmtTime(futureStart));
    assert.equal(d.statusCls, 'opens');
  });

  it('OPERATING closing soon (within 90 min) shows closes-in', () => {
    // end_time 30 minutes from now
    const soonEnd = minToTime(NOW + 30);
    const d = computeLiftDisplay(
      makeLift({ status: 'OPERATING', end_time: soonEnd }),
      TZ, NOW
    );
    assert.equal(d.statusCls, 'closing-soon');
    assert.ok(d.statusText.startsWith('closes in '));
    assert.equal(d.statusColumn, true);
  });

  it('OPERATING past close shows open with detail', () => {
    // end_time 10 minutes ago (past close but not well past)
    const pastEnd = minToTime(NOW - 10);
    const d = computeLiftDisplay(
      makeLift({ status: 'OPERATING', end_time: pastEnd }),
      TZ, NOW
    );
    assert.equal(d.statusText, 'open');
    assert.equal(d.statusCls, 'operating');
    assert.equal(d.detailText, 'closed at ' + fmtTime(pastEnd));
    assert.equal(d.waitText, '');
  });

  it('STANDBY with future start_time shows opens-at', () => {
    const futureStart = minToTime(NOW + 180);
    const d = computeLiftDisplay(
      makeLift({ status: 'STANDBY', start_time: futureStart }),
      TZ, NOW
    );
    // beforeOpen=true, showOpensAt=true
    assert.equal(d.statusText, 'opens ' + fmtTime(futureStart));
    assert.equal(d.statusCls, 'opens');
  });

  it('STANDBY with past start_time returns standby (not opens-at)', () => {
    const pastStart = minToTime(NOW - 60);
    const d = computeLiftDisplay(
      makeLift({ status: 'STANDBY', start_time: pastStart }),
      TZ, NOW
    );
    // beforeOpen=false, wellPastClose=false (no end_time) → showOpensAt=false
    assert.equal(d.statusText, 'standby');
    assert.equal(d.statusCls, 'standby');
  });
});

// ---------------------------------------------------------------------------
// computeRenderedColumns
// ---------------------------------------------------------------------------
describe('computeRenderedColumns', () => {
  it('both status and wait puts status left, wait right', () => {
    const display = { statusText: 'open', statusCls: 'operating', waitText: '5m', waitCls: 'wait-low', statusColumn: false };
    const r = computeRenderedColumns(display, true);
    assert.equal(r.left, 'open');
    assert.equal(r.leftCls, 'operating');
    assert.equal(r.right, '5m');
    assert.equal(r.rightCls, 'wait-low');
  });

  it('only status (no wait) puts status in right column', () => {
    const display = { statusText: 'closed', statusCls: 'closed', waitText: '', waitCls: '', statusColumn: false };
    const r = computeRenderedColumns(display, false);
    assert.equal(r.left, '');
    assert.equal(r.right, 'closed');
    assert.equal(r.rightCls, 'closed');
  });

  it('only wait (no status) puts wait in right column', () => {
    const display = { statusText: '', statusCls: '', waitText: '10m', waitCls: 'wait-mid', statusColumn: false };
    const r = computeRenderedColumns(display, true);
    assert.equal(r.left, '');
    assert.equal(r.right, '10m');
    assert.equal(r.rightCls, 'wait-mid');
  });

  it('strips "opens " prefix for solo status', () => {
    const display = { statusText: 'opens 8:30a', statusCls: 'opens', waitText: '', waitCls: '', statusColumn: false };
    const r = computeRenderedColumns(display, false);
    assert.equal(r.left, '');
    assert.equal(r.right, '8:30a');
    assert.equal(r.rightCls, 'opens');
  });

  it('statusColumn with hasAnyWait puts status in left column', () => {
    const display = { statusText: 'closes in 30m', statusCls: 'closing-soon', waitText: '', waitCls: '', statusColumn: true };
    const r = computeRenderedColumns(display, true);
    assert.equal(r.left, 'closes in 30m');
    assert.equal(r.leftCls, 'closing-soon');
    assert.equal(r.right, '');
  });

  it('statusColumn without hasAnyWait falls through to right column', () => {
    const display = { statusText: 'closes in 30m', statusCls: 'closing-soon', waitText: '', waitCls: '', statusColumn: true };
    const r = computeRenderedColumns(display, false);
    // hasAnyWait=false so the statusColumn branch is not taken
    assert.equal(r.left, '');
    assert.equal(r.right, 'closes in 30m');
    assert.equal(r.rightCls, 'closing-soon');
  });
});

// ---------------------------------------------------------------------------
// augmentDisplay — integration
// ---------------------------------------------------------------------------
describe('augmentDisplay', () => {
  it('adds display fields to each lift and hasAnyWait to sub-resorts', () => {
    const subResorts = [
      {
        id: 'test-resort',
        name: 'Test',
        lifts: [
          makeLift({ status: 'OPERATING', waitMinutes: null }),
          makeLift({ status: 'CLOSED', scheduled: false }),
        ],
      },
    ];

    const result = augmentDisplay(subResorts, TZ, NOW);

    assert.equal(result[0].hasAnyWait, false);
    for (const lift of result[0].lifts) {
      assert.ok('display' in lift, 'lift should have display');
      assert.ok('left' in lift.display);
      assert.ok('right' in lift.display);
      assert.ok('leftCls' in lift.display);
      assert.ok('rightCls' in lift.display);
      assert.ok('detailText' in lift.display);
    }
  });

  it('sets hasAnyWait=true when at least one lift has waitMinutes', () => {
    const subResorts = [
      {
        id: 'wait-resort',
        name: 'Wait',
        lifts: [
          makeLift({ status: 'OPERATING', waitMinutes: 5 }),
          makeLift({ status: 'CLOSED' }),
        ],
      },
    ];

    const result = augmentDisplay(subResorts, TZ, NOW);
    assert.equal(result[0].hasAnyWait, true);
  });

  it('skips sub-resorts with no lifts array', () => {
    const subResorts = [{ id: 'empty', name: 'Empty' }];
    const result = augmentDisplay(subResorts, TZ, NOW);
    assert.equal(result[0].hasAnyWait, undefined);
  });

  it('returns the same array reference (mutates in place)', () => {
    const subResorts = [{ id: 'r', name: 'R', lifts: [] }];
    const result = augmentDisplay(subResorts, TZ, NOW);
    assert.equal(result, subResorts);
  });
});

// ---------------------------------------------------------------------------
// nowMinutes — sanity check
// ---------------------------------------------------------------------------
describe('nowMinutes', () => {
  it('returns a number between 0 and 1439', () => {
    const m = nowMinutes('UTC');
    assert.ok(typeof m === 'number');
    assert.ok(m >= 0 && m < 1440, `Expected 0-1439, got ${m}`);
  });

  it('different timezones may return different values', () => {
    // Just verifying it does not throw for a few common timezones
    assert.ok(typeof nowMinutes('America/New_York') === 'number');
    assert.ok(typeof nowMinutes('Asia/Tokyo') === 'number');
    assert.ok(typeof nowMinutes('Pacific/Auckland') === 'number');
  });
});
