import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRONES, SERIES, getDrone, sanitizeCustom, weightClass, DEFAULT_DRONE_ID } from '../www/drones.js';
import { evaluate, GO, CAUTION, NOGO } from '../www/conditions.js';

const calm = {
  windMs: 2, gustMs: 3, wind80Ms: 4, tempC: 18, dewPointC: 8, precipMm: 0,
  precipProb: 5, visibilityM: 20000, weatherCode: 1, isDay: true,
};

test('every profile is complete and belongs to a series', () => {
  const ids = new Set();
  for (const d of DRONES) {
    assert.ok(!ids.has(d.id), `duplicate id ${d.id}`); ids.add(d.id);
    assert.ok(SERIES.some((s) => s.id === d.series), `${d.id} series`);
    for (const k of ['maxWindMs', 'minTempC', 'maxTempC', 'maxTakeoffAltitudeM', 'weightG']) {
      assert.equal(typeof d[k], 'number', `${d.id}.${k}`);
    }
    assert.ok(d.minTempC < d.maxTempC);
  }
  assert.ok(ids.has(DEFAULT_DRONE_ID));
});

test('limits follow the selected drone', () => {
  const gusty = { ...calm, gustMs: 9 };
  // 9 m/s gusts exceed the Neo's 8 m/s rating but are fine-ish for a Mavic 4 Pro (12 m/s)
  assert.equal(evaluate(gusty, {}, getDrone('neo')).level, NOGO);
  assert.equal(evaluate(gusty, {}, getDrone('mavic-4-pro')).level, CAUTION);
  assert.equal(evaluate({ ...calm, gustMs: 7 }, {}, getDrone('mavic-4-pro')).level, GO);
});

test('temperature range follows the drone', () => {
  const cold = { ...calm, tempC: -5, dewPointC: -12 };
  assert.equal(evaluate(cold, {}, getDrone('mini-4k')).level, NOGO);   // rated from 0 °C
  assert.equal(evaluate(cold, {}, getDrone('mini-4-pro')).level, CAUTION); // rated from -10 °C
});

test('takeoff altitude follows the drone', () => {
  assert.equal(evaluate(calm, { elevationM: 2500 }, getDrone('neo-2')).level, NOGO);
  assert.equal(evaluate(calm, { elevationM: 2500 }, getDrone('air-3s')).level, GO);
});

test('unknown id falls back to the default drone', () => {
  assert.equal(getDrone('nope').id, DEFAULT_DRONE_ID);
});

test('custom drone merges sanitized values', () => {
  const d = getDrone('custom', { name: ' Spark ', maxWindMs: '9', minTempC: 'abc', maxTakeoffAltitudeM: 99999 });
  assert.equal(d.name, 'Spark');
  assert.equal(d.maxWindMs, 9);
  assert.equal(d.minTempC, 0);            // invalid → default
  assert.equal(d.maxTakeoffAltitudeM, 4000); // out of range → default
  assert.deepEqual(sanitizeCustom(undefined), {});
});

test('weight class', () => {
  assert.equal(weightClass(249.9).label, 'Under 250 g');
  assert.equal(weightClass(250).label, '250 g or more');
  assert.equal(weightClass(null), null);
});
