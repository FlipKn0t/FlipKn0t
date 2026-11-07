import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluate, GO, CAUTION, NOGO, currentConditions, currentHourIndex, parseKp,
} from '../conditions.js';

const calm = {
  windMs: 2, gustMs: 3, wind80Ms: 4, tempC: 18, dewPointC: 8, precipMm: 0,
  precipProb: 5, visibilityM: 20000, weatherCode: 1, isDay: true,
};
const level = (w, ctx) => evaluate(w, ctx).level;
const check = (w, id, ctx) => evaluate(w, ctx).checks.find((c) => c.id === id);

test('calm, dry daytime is GO', () => {
  assert.equal(level(calm), GO);
});

test('gusts above 10.7 m/s are NO-GO', () => {
  assert.equal(check({ ...calm, gustMs: 11 }, 'gusts').level, NOGO);
  assert.equal(check({ ...calm, gustMs: 8 }, 'gusts').level, CAUTION);
  assert.equal(level({ ...calm, gustMs: 11 }), NOGO);
});

test('sustained wind thresholds', () => {
  assert.equal(check({ ...calm, windMs: 5 }, 'wind').level, GO);
  assert.equal(check({ ...calm, windMs: 6 }, 'wind').level, CAUTION);
  assert.equal(check({ ...calm, windMs: 9 }, 'wind').level, NOGO);
});

test('any rain is NO-GO, high probability is CAUTION', () => {
  assert.equal(level({ ...calm, precipMm: 0.2 }), NOGO);
  assert.equal(level({ ...calm, weatherCode: 61 }), NOGO);
  assert.equal(level({ ...calm, precipProb: 60 }), CAUTION);
});

test('thunderstorm is NO-GO', () => {
  assert.ok(evaluate({ ...calm, weatherCode: 95 }).checks.some((c) => c.id === 'storm'));
  assert.equal(level({ ...calm, weatherCode: 95 }), NOGO);
});

test('visibility thresholds', () => {
  assert.equal(check({ ...calm, visibilityM: 800 }, 'visibility').level, NOGO);
  assert.equal(check({ ...calm, visibilityM: 3000 }, 'visibility').level, CAUTION);
});

test('temperature limits', () => {
  assert.equal(check({ ...calm, tempC: -12, dewPointC: -20 }, 'temp').level, NOGO);
  assert.equal(check({ ...calm, tempC: 2, dewPointC: -5 }, 'temp').level, CAUTION);
  assert.equal(check({ ...calm, tempC: 41 }, 'temp').level, NOGO);
});

test('fog and dew-point spread', () => {
  assert.equal(check({ ...calm, tempC: 10, dewPointC: 9 }, 'fog').level, CAUTION);
  assert.equal(check({ ...calm, weatherCode: 45 }, 'fog').level, NOGO);
});

test('night is CAUTION', () => {
  assert.equal(level({ ...calm, isDay: false }), CAUTION);
});

test('Kp and elevation context', () => {
  assert.equal(level(calm, { kp: 5.3 }), CAUTION);
  assert.equal(level(calm, { kp: 7 }), NOGO);
  assert.equal(level(calm, { elevationM: 2500 }), NOGO);
  assert.equal(level(calm, { elevationM: 1500 }), GO);
});

test('missing fields are skipped, not failed', () => {
  assert.equal(level({ windMs: 1 }), GO);
});

test('currentConditions merges hourly fields into current', () => {
  const data = {
    current: { time: '2026-11-07T14:15', wind_speed_10m: 3, is_day: 1 },
    hourly: {
      time: ['2026-11-07T13:00', '2026-11-07T14:00'],
      wind_speed_10m: [1, 2], wind_speed_80m: [5, 6], precipitation_probability: [10, 20],
    },
  };
  assert.equal(currentHourIndex(data), 1);
  const w = currentConditions(data);
  assert.equal(w.windMs, 3);
  assert.equal(w.wind80Ms, 6);
  assert.equal(w.precipProb, 20);
  assert.equal(w.isDay, true);
});

test('parseKp handles both NOAA formats', () => {
  assert.equal(parseKp([['time_tag', 'Kp', 'a_running', 'station_count'], ['2026-11-07 12:00', '3.33', '18', '8']]), 3.33);
  assert.equal(parseKp([{ time_tag: '2026-11-07T12:00:00', Kp: 4.67 }]), 4.67);
  assert.equal(parseKp([]), null);
  assert.equal(parseKp(null), null);
});
