// Flying-condition rules for the DJI Neo 2.
// Pure functions only (no DOM, no network) so they can be unit-tested.

export const NEO2 = {
  name: 'DJI Neo 2',
  maxWindMs: 10.7,          // DJI spec: max wind speed resistance 10.7 m/s (Level 5)
  minTempC: -10,            // DJI spec: operating temperature -10 to 40 °C
  maxTempC: 40,
  maxTakeoffAltitudeM: 2000,
};

export const GO = 'go';
export const CAUTION = 'caution';
export const NOGO = 'nogo';

const RANK = { [GO]: 0, [CAUTION]: 1, [NOGO]: 2 };
export const worst = (levels) =>
  levels.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), GO);

// WMO weather interpretation codes (used by Open-Meteo)
export const WMO = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Freezing fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  56: 'Freezing drizzle', 57: 'Heavy freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Heavy freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light showers', 81: 'Showers', 82: 'Violent showers',
  85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Severe thunderstorm with hail',
};

export const isPrecipCode = (c) => c >= 51; // drizzle, rain, snow, showers, storms
export const isThunderCode = (c) => c >= 95;
export const isFogCode = (c) => c === 45 || c === 48;

/**
 * Evaluate one point in time.
 * @param {object} w  Weather in metric units:
 *   windMs, gustMs, wind80Ms, tempC, dewPointC, precipMm, precipProb (0-100),
 *   visibilityM, weatherCode, isDay (bool), cloudCover (0-100)
 * @param {object} [ctx] Optional: { kp, elevationM }
 * @returns {{ level, checks: Array<{id,label,level,detail}> }}
 *   `detail` is a short reason; value formatting is left to the UI.
 */
export function evaluate(w, ctx = {}, spec = NEO2) {
  const checks = [];
  const add = (id, label, level, detail) => checks.push({ id, label, level, detail });
  const has = (v) => v !== null && v !== undefined && !Number.isNaN(v);

  // Wind (sustained, near ground)
  if (has(w.windMs)) {
    const r = w.windMs / spec.maxWindMs;
    add('wind', 'Wind', r >= 0.8 ? NOGO : r >= 0.5 ? CAUTION : GO,
      r >= 0.8 ? 'Too close to the Neo 2’s 10.7 m/s limit'
        : r >= 0.5 ? 'Breezy. Expect drift, and keep it close'
          : 'Light wind');
  }

  // Gusts
  if (has(w.gustMs)) {
    const r = w.gustMs / spec.maxWindMs;
    add('gusts', 'Gusts', r >= 1 ? NOGO : r >= 0.7 ? CAUTION : GO,
      r >= 1 ? 'Gusts exceed the drone’s wind resistance'
        : r >= 0.7 ? 'Strong gusts. It may struggle to return'
          : 'Gusts within limits');
  }

  // Wind aloft (80 m): what the drone meets once it climbs
  if (has(w.wind80Ms)) {
    const r = w.wind80Ms / spec.maxWindMs;
    add('aloft', 'Wind at altitude', r >= 1 ? NOGO : r >= 0.75 ? CAUTION : GO,
      r >= 1 ? 'Too windy up high. Stay low or don’t fly'
        : r >= 0.75 ? 'Much stronger up high. Limit your altitude'
          : 'Calm enough aloft');
  }

  // Precipitation: the Neo 2 has no water resistance
  if (has(w.precipMm) || has(w.weatherCode) || has(w.precipProb)) {
    const raining = (has(w.precipMm) && w.precipMm > 0) ||
      (has(w.weatherCode) && isPrecipCode(w.weatherCode));
    const prob = has(w.precipProb) ? w.precipProb : 0;
    add('precip', 'Precipitation',
      raining ? NOGO : prob >= 40 ? CAUTION : GO,
      raining ? 'Rain or snow. The Neo 2 isn’t waterproof'
        : prob >= 40 ? 'Chance of rain. Watch the sky'
          : 'Dry');
  }

  // Thunderstorms
  if (has(w.weatherCode) && isThunderCode(w.weatherCode)) {
    add('storm', 'Thunderstorm', NOGO, 'Lightning risk. Do not fly');
  }

  // Visibility (you must keep visual line of sight)
  if (has(w.visibilityM)) {
    const v = w.visibilityM;
    add('visibility', 'Visibility', v < 1000 ? NOGO : v < 5000 ? CAUTION : GO,
      v < 1000 ? 'Too poor to keep line of sight'
        : v < 5000 ? 'Reduced. Keep the drone close'
          : 'Good');
  }

  // Temperature (battery and electronics)
  if (has(w.tempC)) {
    const t = w.tempC;
    let level = GO, detail = 'Within operating range';
    if (t < spec.minTempC || t > spec.maxTempC) { level = NOGO; detail = 'Outside the −10 to 40 °C operating range'; }
    else if (t < 5) { level = CAUTION; detail = 'Cold. Battery life is shorter, so warm batteries first'; }
    else if (t > 35) { level = CAUTION; detail = 'Hot. Watch for overheating'; }
    add('temp', 'Temperature', level, detail);
  }

  // Fog and condensation risk from the dew point spread
  if (has(w.tempC) && has(w.dewPointC)) {
    const spread = w.tempC - w.dewPointC;
    const fog = has(w.weatherCode) && isFogCode(w.weatherCode);
    add('fog', 'Fog / condensation', fog ? NOGO : spread < 2 ? CAUTION : GO,
      fog ? 'Fog reported'
        : spread < 2 ? 'Air near saturation. Fog or lens moisture is likely'
          : 'Low fog risk');
  }

  // Daylight
  if (w.isDay !== undefined && w.isDay !== null) {
    add('daylight', 'Daylight', w.isDay ? GO : CAUTION,
      w.isDay ? 'Daytime' : 'Dark. Night flying limits what you can see, and rules apply');
  }

  // Geomagnetic activity (affects GPS positioning)
  if (has(ctx.kp)) {
    add('kp', 'GPS / Kp index', ctx.kp >= 7 ? NOGO : ctx.kp >= 5 ? CAUTION : GO,
      ctx.kp >= 7 ? 'Severe geomagnetic storm. GPS is unreliable'
        : ctx.kp >= 5 ? 'Geomagnetic storm. GPS may drift'
          : 'Quiet');
  }

  // Takeoff altitude
  if (has(ctx.elevationM) && ctx.elevationM > spec.maxTakeoffAltitudeM) {
    add('elevation', 'Takeoff altitude', NOGO,
      'Above the Neo 2’s 2000 m max takeoff altitude');
  }

  return { level: worst(checks.map((c) => c.level)), checks };
}

/** Pull a single-time weather object out of an Open-Meteo hourly block. */
export function hourAt(hourly, i) {
  return {
    time: hourly.time[i],
    windMs: hourly.wind_speed_10m?.[i],
    gustMs: hourly.wind_gusts_10m?.[i],
    wind80Ms: hourly.wind_speed_80m?.[i],
    windDir: hourly.wind_direction_10m?.[i],
    tempC: hourly.temperature_2m?.[i],
    dewPointC: hourly.dew_point_2m?.[i],
    precipMm: hourly.precipitation?.[i],
    precipProb: hourly.precipitation_probability?.[i],
    visibilityM: hourly.visibility?.[i],
    weatherCode: hourly.weather_code?.[i],
    cloudCover: hourly.cloud_cover?.[i],
    isDay: hourly.is_day ? hourly.is_day[i] === 1 : undefined,
  };
}

/**
 * Current conditions: Open-Meteo `current` merged over the matching hourly
 * slot (fills anything `current` lacks, e.g. 80 m wind and precip probability).
 */
export function currentConditions(data) {
  const c = data.current || {};
  const idx = currentHourIndex(data);
  const base = idx >= 0 ? hourAt(data.hourly, idx) : {};
  const pick = (k, fallback) => (c[k] !== undefined && c[k] !== null ? c[k] : fallback);
  return {
    ...base,
    time: c.time || base.time,
    windMs: pick('wind_speed_10m', base.windMs),
    gustMs: pick('wind_gusts_10m', base.gustMs),
    windDir: pick('wind_direction_10m', base.windDir),
    tempC: pick('temperature_2m', base.tempC),
    dewPointC: pick('dew_point_2m', base.dewPointC),
    precipMm: pick('precipitation', base.precipMm),
    visibilityM: pick('visibility', base.visibilityM),
    weatherCode: pick('weather_code', base.weatherCode),
    cloudCover: pick('cloud_cover', base.cloudCover),
    isDay: c.is_day !== undefined ? c.is_day === 1 : base.isDay,
  };
}

/** Index of the hourly slot containing `current.time` (both local ISO strings). */
export function currentHourIndex(data) {
  const t = data.current?.time;
  if (!t || !data.hourly?.time) return -1;
  const hour = t.slice(0, 13) + ':00';
  return data.hourly.time.indexOf(hour);
}

/** Parse NOAA SWPC planetary K-index JSON (handles both array-of-arrays and array-of-objects). */
export function parseKp(json) {
  if (!Array.isArray(json) || json.length === 0) return null;
  const last = json[json.length - 1];
  let v;
  if (Array.isArray(last)) {
    const header = json[0];
    const col = Array.isArray(header) ? header.findIndex((h) => String(h).toLowerCase() === 'kp') : 1;
    v = last[col >= 0 ? col : 1];
  } else if (last && typeof last === 'object') {
    v = last.Kp ?? last.kp ?? last.kp_index ?? last.estimated_kp;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
