// Aircraft profiles. Figures are taken from the manufacturer's published spec sheets
// (max wind speed resistance, operating temperature, max takeoff altitude, takeoff weight).
// `unverified` lists fields we could not confirm against an official spec page.
// Model names are used only to identify which aircraft a profile applies to.

export const SERIES = [
  { id: 'neo', name: 'Neo' },
  { id: 'lito', name: 'Lito' },
  { id: 'flip', name: 'Flip' },
  { id: 'mini', name: 'Mini' },
  { id: 'air', name: 'Air' },
  { id: 'mavic', name: 'Mavic' },
  { id: 'avata', name: 'Avata' },
];

export const DRONES = [
  {
    id: 'neo', series: 'neo', name: 'Neo', weightG: 135,
    maxWindMs: 8, windLevel: 4, minTempC: 0, maxTempC: 40, maxTakeoffAltitudeM: 2000,
    flightTimeMin: 18,
    notes: 'Very light. Even a light breeze pushes it around, so stay close and low.',
  },
  {
    id: 'neo-2', series: 'neo', name: 'Neo 2', weightG: 151,
    maxWindMs: 10.7, windLevel: 5, minTempC: -10, maxTempC: 40, maxTakeoffAltitudeM: 2000,
    flightTimeMin: 19,
    notes: 'Light and not water-resistant. Keep it close in gusty conditions.',
  },
  {
    id: 'lito-1', series: 'lito', name: 'Lito 1', weightG: 249,
    maxWindMs: 10.7, windLevel: 5, minTempC: 5, maxTempC: 40, maxTakeoffAltitudeM: 4500,
    flightTimeMin: 36,
    unverified: ['minTempC', 'maxTakeoffAltitudeM'],
    notes: 'Reported to be limited to 5 °C and above. Check your manual for the exact figures.',
  },
  {
    id: 'lito-x1', series: 'lito', name: 'Lito X1', weightG: 249,
    maxWindMs: 10.7, windLevel: 5, minTempC: -10, maxTempC: 40, maxTakeoffAltitudeM: 4500,
    flightTimeMin: 36,
    notes: 'The Plus battery takes it over 249 g and lowers the max takeoff altitude to 3500 m.',
  },
  {
    id: 'flip', series: 'flip', name: 'Flip', weightG: 249,
    maxWindMs: 10.7, windLevel: 5, minTempC: -10, maxTempC: 40, maxTakeoffAltitudeM: 3000,
    flightTimeMin: 31,
    notes: 'The full-coverage prop guards catch wind. Expect more drift than a Mini.',
  },
  {
    id: 'mini-4k', series: 'mini', name: 'Mini 4K', weightG: 249,
    maxWindMs: 10.7, windLevel: 5, minTempC: 0, maxTempC: 40, maxTakeoffAltitudeM: 4000,
    flightTimeMin: 31,
    notes: 'Rated from 0 °C, not −10 °C. With prop guards the max takeoff altitude is 2000 m.',
  },
  {
    id: 'mini-4-pro', series: 'mini', name: 'Mini 4 Pro', weightG: 249,
    maxWindMs: 10.7, windLevel: 5, minTempC: -10, maxTempC: 40, maxTakeoffAltitudeM: 4000,
    flightTimeMin: 34,
    notes: 'With the Plus battery it weighs more than 249 g and the max takeoff altitude is 3000 m.',
  },
  {
    id: 'mini-5-pro', series: 'mini', name: 'Mini 5 Pro', weightG: 249.9,
    maxWindMs: 12, windLevel: 6, minTempC: -10, maxTempC: 40, maxTakeoffAltitudeM: 6000,
    flightTimeMin: 36,
    notes: 'With the Plus battery the max takeoff altitude is 4500 m, or 2000 m with the 360° prop guard.',
  },
  {
    id: 'air-3', series: 'air', name: 'Air 3', weightG: 720,
    maxWindMs: 12, windLevel: 6, minTempC: -10, maxTempC: 40, maxTakeoffAltitudeM: 6000,
    flightTimeMin: 46,
  },
  {
    id: 'air-3s', series: 'air', name: 'Air 3S', weightG: 724,
    maxWindMs: 12, windLevel: 6, minTempC: -10, maxTempC: 40, maxTakeoffAltitudeM: 6000,
    flightTimeMin: 45,
  },
  {
    id: 'mavic-3-pro', series: 'mavic', name: 'Mavic 3 Pro', weightG: 958,
    maxWindMs: 12, windLevel: 6, minTempC: -10, maxTempC: 40, maxTakeoffAltitudeM: 6000,
    flightTimeMin: 43,
  },
  {
    id: 'mavic-4-pro', series: 'mavic', name: 'Mavic 4 Pro', weightG: 1063,
    maxWindMs: 12, windLevel: 6, minTempC: -10, maxTempC: 40, maxTakeoffAltitudeM: 6000,
    flightTimeMin: 51,
    notes: 'With prop guards fitted the max takeoff altitude is 3000 m.',
  },
  {
    id: 'avata-2', series: 'avata', name: 'Avata 2', weightG: 377,
    maxWindMs: 10.7, windLevel: 5, minTempC: -10, maxTempC: 40, maxTakeoffAltitudeM: 5000,
    flightTimeMin: 23,
    notes: 'Flown through goggles, so a spotter is often required to keep visual line of sight.',
  },
  {
    id: 'avata-360', series: 'avata', name: 'Avata 360', weightG: 455,
    maxWindMs: 10.7, windLevel: 5, minTempC: -10, maxTempC: 40, maxTakeoffAltitudeM: 4500,
    flightTimeMin: 23,
    notes: 'Flown through goggles, so a spotter is often required to keep visual line of sight.',
  },
];

export const DEFAULT_DRONE_ID = 'neo-2';

export const CUSTOM_DEFAULTS = {
  id: 'custom', series: 'custom', name: 'Custom drone', weightG: 249,
  maxWindMs: 10.7, windLevel: null, minTempC: 0, maxTempC: 40, maxTakeoffAltitudeM: 4000,
  flightTimeMin: null, custom: true,
  notes: 'Your own limits. Copy them from your drone’s spec sheet or manual.',
};

/** Resolve a drone profile; `custom` overrides come from the user's saved settings. */
export function getDrone(id, custom) {
  if (id === 'custom') return { ...CUSTOM_DEFAULTS, ...sanitizeCustom(custom) };
  return DRONES.find((d) => d.id === id) || DRONES.find((d) => d.id === DEFAULT_DRONE_ID);
}

export function sanitizeCustom(c = {}) {
  const num = (v, lo, hi) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined;
  };
  const out = {
    name: typeof c.name === 'string' && c.name.trim() ? c.name.trim().slice(0, 40) : undefined,
    maxWindMs: num(c.maxWindMs, 1, 40),
    minTempC: num(c.minTempC, -40, 30),
    maxTempC: num(c.maxTempC, 10, 60),
    maxTakeoffAltitudeM: num(c.maxTakeoffAltitudeM, 100, 9000),
    weightG: num(c.weightG, 10, 25000),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}

/** Weight class shown to the user. Thresholds are the common sub-250 g break point. */
export function weightClass(weightG) {
  if (weightG == null) return null;
  return weightG < 250
    ? { label: 'Under 250 g', detail: 'Many countries have lighter rules for drones in this class. Check your local regulations.' }
    : { label: '250 g or more', detail: 'Registration and a pilot test are usually required. Check your local regulations.' };
}
