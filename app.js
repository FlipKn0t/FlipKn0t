import {
  NEO2, GO, CAUTION, NOGO, WMO, evaluate, hourAt, currentConditions, currentHourIndex, parseKp,
} from './conditions.js';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'neo2-flight-check';
const REFRESH_MS = 10 * 60 * 1000;

const HOURLY_VARS = [
  'temperature_2m', 'dew_point_2m', 'precipitation_probability', 'precipitation', 'weather_code',
  'visibility', 'wind_speed_10m', 'wind_speed_80m', 'wind_gusts_10m', 'wind_direction_10m',
  'is_day', 'cloud_cover', 'relative_humidity_2m',
];
const CURRENT_VARS = [
  'temperature_2m', 'dew_point_2m', 'relative_humidity_2m', 'precipitation', 'weather_code',
  'cloud_cover', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'is_day', 'visibility',
];

// ---------- settings ----------
function defaultUnits() {
  const us = /-(US|LR|MM)$/i.test(navigator.language || '');
  const gb = /-GB$/i.test(navigator.language || '');
  return { wind: us || gb ? 'mph' : 'kmh', temp: us ? 'F' : 'C', dist: us || gb ? 'mi' : 'km' };
}
function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state.saved)); } catch { /* private mode */ }
}

const state = {
  saved: { units: defaultUnits(), ...load() },
  data: null,
  kp: null,
  selected: null, // hourly index the user tapped, or null for "now"
};
state.saved.units = { ...defaultUnits(), ...state.saved.units };

// ---------- formatting ----------
const U = () => state.saved.units;
function fmtWind(ms) {
  if (ms == null) return '–';
  switch (U().wind) {
    case 'mph': return `${Math.round(ms * 2.23694)} mph`;
    case 'kmh': return `${Math.round(ms * 3.6)} km/h`;
    case 'kn': return `${Math.round(ms * 1.94384)} kn`;
    default: return `${ms.toFixed(1)} m/s`;
  }
}
const fmtWindShort = (ms) => fmtWind(ms).split(' ')[0];
function fmtTemp(c) {
  if (c == null) return '–';
  return U().temp === 'F' ? `${Math.round(c * 9 / 5 + 32)}°F` : `${Math.round(c)}°C`;
}
function fmtTempDelta(c) {
  return U().temp === 'F' ? `${Math.round(c * 9 / 5)}°F` : `${Math.round(c)}°C`;
}
function fmtDist(m) {
  if (m == null) return '–';
  if (U().dist === 'mi') {
    const mi = m / 1609.34;
    return mi >= 10 ? '10+ mi' : `${mi.toFixed(mi < 1 ? 2 : 1)} mi`;
  }
  const km = m / 1000;
  return km >= 16 ? '16+ km' : `${km.toFixed(km < 1 ? 2 : 1)} km`;
}
function compass(deg) {
  if (deg == null) return '';
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
}
// Open-Meteo returns local wall-clock strings ("2026-11-07T14:00"); format them without
// re-interpreting in the device's time zone.
function fmtClock(iso, opts = { hour: 'numeric', minute: '2-digit' }) {
  if (!iso) return '–';
  const [d, t] = iso.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, mo - 1, da, h, mi)));
}
const fmtHour = (iso) => fmtClock(iso, { hour: 'numeric' });

const VERDICT_TEXT = {
  [GO]: ['Good to fly', 'Conditions are within the Neo 2’s limits'],
  [CAUTION]: ['Fly with caution', 'Flyable, but watch the items in amber'],
  [NOGO]: ['Don’t fly', 'At least one condition is outside safe limits'],
};

function valueFor(check, w) {
  switch (check.id) {
    case 'wind': return `${fmtWind(w.windMs)} ${compass(w.windDir)}`;
    case 'gusts': return fmtWind(w.gustMs);
    case 'aloft': return `${fmtWind(w.wind80Ms)} @80 m`;
    case 'precip': {
      const parts = [];
      if (w.precipProb != null) parts.push(`${w.precipProb}%`);
      if (w.precipMm) parts.push(`${w.precipMm} mm`);
      return parts.join(' · ') || (WMO[w.weatherCode] ?? '');
    }
    case 'visibility': return fmtDist(w.visibilityM);
    case 'temp': return fmtTemp(w.tempC);
    case 'fog': return `Δ ${fmtTempDelta(w.tempC - w.dewPointC)}`;
    case 'daylight': return w.isDay ? '☀︎' : '☾';
    case 'kp': return `Kp ${state.kp}`;
    case 'elevation': return `${Math.round(state.data.elevation)} m`;
    default: return '';
  }
}

// ---------- rendering ----------
function ctx() {
  return { kp: state.kp, elevationM: state.data?.elevation };
}

function render() {
  const data = state.data;
  if (!data) return;
  const nowIdx = currentHourIndex(data);
  const sel = state.selected;
  const w = sel == null ? currentConditions(data) : hourAt(data.hourly, sel);
  const result = evaluate(w, ctx());

  // verdict
  const [label, sub] = VERDICT_TEXT[result.level];
  $('verdict').dataset.level = result.level;
  $('verdictLabel').textContent = label;
  $('verdictSub').textContent = sel == null
    ? `${sub}. ${WMO[w.weatherCode] ?? ''}`
    : `Forecast for ${fmtClock(w.time, { weekday: 'short', hour: 'numeric' })}. ${WMO[w.weatherCode] ?? ''}`;

  // checks
  document.querySelector('#checks').closest('.card').querySelector('h2').textContent =
    sel == null ? 'Right now' : `At ${fmtClock(w.time, { weekday: 'short', hour: 'numeric' })}`;
  const order = { [NOGO]: 0, [CAUTION]: 1, [GO]: 2 };
  $('checks').replaceChildren(...[...result.checks]
    .sort((a, b) => order[a.level] - order[b.level])
    .map((c) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="dot ${c.level}"></span>
        <span class="check-label"></span><span class="check-value"></span>
        <span class="check-detail"></span>`;
      li.querySelector('.check-label').textContent = c.label;
      li.querySelector('.check-value').textContent = valueFor(c, w);
      li.querySelector('.check-detail').textContent = c.detail;
      return li;
    }));

  // timeline (next 24 h)
  const start = Math.max(nowIdx, 0);
  const end = Math.min(start + 24, data.hourly.time.length);
  const hours = [];
  for (let i = start; i < end; i++) {
    const hw = hourAt(data.hourly, i);
    hours.push({ i, w: hw, level: evaluate(hw, ctx()).level });
  }
  $('timeline').replaceChildren(...hours.map(({ i, w: hw, level }) => {
    const b = document.createElement('button');
    b.className = `hour ${level}`;
    b.setAttribute('role', 'listitem');
    b.setAttribute('aria-pressed', String(sel === i));
    b.setAttribute('aria-label', `${fmtHour(hw.time)}: ${VERDICT_TEXT[level][0]}`);
    b.innerHTML = `<div class="h-time"></div><div class="h-bar"></div>
      <div class="h-wind"></div><div class="h-rain"></div>`;
    b.querySelector('.h-time').textContent = i === nowIdx ? 'Now' : fmtHour(hw.time);
    b.querySelector('.h-wind').textContent = `💨${fmtWindShort(hw.gustMs ?? hw.windMs)}`;
    b.querySelector('.h-rain').textContent = `💧${hw.precipProb ?? 0}%`;
    b.addEventListener('click', () => {
      state.selected = (sel === i || i === nowIdx) ? null : i;
      render();
    });
    return b;
  }));
  $('bestWindow').textContent = bestWindowText(hours, nowIdx);

  // details
  const d = data.daily || {};
  const todayIdx = 0;
  const rows = [
    ['Conditions', WMO[w.weatherCode] ?? '–'],
    ['Wind direction', w.windDir != null ? `${compass(w.windDir)} (${Math.round(w.windDir)}°)` : '–'],
    ['Cloud cover', w.cloudCover != null ? `${w.cloudCover}%` : '–'],
    ['Dew point', fmtTemp(w.dewPointC)],
    ['Sunrise', fmtClock(d.sunrise?.[todayIdx])],
    ['Sunset', fmtClock(d.sunset?.[todayIdx])],
    ['Kp index (GPS)', state.kp != null ? String(state.kp) : 'unavailable'],
    ['Ground elevation', data.elevation != null ? `${Math.round(data.elevation)} m` : '–'],
    ['Neo 2 wind limit', fmtWind(NEO2.maxWindMs)],
  ];
  $('details').replaceChildren(...rows.flatMap(([k, v]) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    return [dt, dd];
  }));

  $('updated').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function bestWindowText(hours, nowIdx) {
  if (!hours.length) return '';
  const runs = [];
  let cur = null;
  for (const h of hours) {
    if (h.level === GO) {
      if (cur) cur.end = h; else cur = { start: h, end: h };
    } else if (cur) { runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);
  const endLabel = (r) => {
    const next = hours[hours.indexOf(r.end) + 1];
    return next ? fmtHour(next.w.time) : 'later';
  };
  if (!runs.length) {
    const caution = hours.find((h) => h.level === CAUTION);
    return caution
      ? `No all-green hours in the next 24 h. Least bad from ${fmtHour(caution.w.time)} (caution).`
      : 'No flyable hours in the next 24 h.';
  }
  const first = runs[0];
  if (first.start.i === nowIdx) return `✅ Good to fly now, until about ${endLabel(first)}.`;
  const longest = runs.reduce((a, b) => (b.end.i - b.start.i > a.end.i - a.start.i ? b : a));
  const txt = `Next good window: ${fmtHour(first.start.w.time)} – ${endLabel(first)}.`;
  return longest === first ? txt
    : `${txt} Longest: ${fmtHour(longest.start.w.time)} – ${endLabel(longest)}.`;
}

function showError(msg) {
  $('verdict').dataset.level = 'loading';
  $('verdictLabel').textContent = 'Can’t load conditions';
  $('verdictSub').textContent = msg;
}

// ---------- data ----------
async function fetchWeather(lat, lon) {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lon.toFixed(4),
    current: CURRENT_VARS.join(','), hourly: HOURLY_VARS.join(','),
    daily: 'sunrise,sunset', wind_speed_unit: 'ms', timezone: 'auto', forecast_days: '2',
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${p}`);
  if (!r.ok) throw new Error(`Weather service error (${r.status})`);
  return r.json();
}
async function fetchKp() {
  try {
    const r = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json');
    if (!r.ok) return null;
    return parseKp(await r.json());
  } catch { return null; }
}

async function refresh() {
  const loc = state.saved.location;
  if (!loc) return;
  $('locName').textContent = loc.name;
  try {
    const [data, kp] = await Promise.all([fetchWeather(loc.lat, loc.lon), fetchKp()]);
    state.data = data;
    state.kp = kp;
    if (state.selected != null && state.selected < currentHourIndex(data)) state.selected = null;
    render();
  } catch (e) {
    showError(navigator.onLine === false ? 'You appear to be offline.' : e.message);
  }
}

function setLocation(loc) {
  state.saved.location = loc;
  state.selected = null;
  save();
  refresh();
}

function useGPS() {
  if (!('geolocation' in navigator)) {
    showError('Location isn’t available. Search for a place in Settings.');
    return;
  }
  $('locName').textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      setLocation({ lat, lon, name: `Current location (${lat.toFixed(2)}, ${lon.toFixed(2)})`, gps: true });
    },
    () => {
      $('locName').textContent = 'No location set';
      showError('Location permission was denied. Tap ⚙︎ to search for a place.');
      $('settings').showModal();
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 },
  );
}

async function search(q) {
  const list = $('searchResults');
  list.replaceChildren();
  if (!q.trim()) return;
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: q, count: '6' })}`);
    const j = await r.json();
    const results = j.results || [];
    if (!results.length) {
      const li = document.createElement('li'); li.textContent = 'No matches.'; list.append(li); return;
    }
    list.replaceChildren(...results.map((p) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      const name = [p.name, p.admin1, p.country_code].filter(Boolean).join(', ');
      b.textContent = name;
      b.addEventListener('click', () => {
        setLocation({ lat: p.latitude, lon: p.longitude, name });
        list.replaceChildren();
        $('settings').close();
      });
      li.append(b);
      return li;
    }));
  } catch {
    const li = document.createElement('li'); li.textContent = 'Search failed. Check your connection.'; list.append(li);
  }
}

// ---------- wiring ----------
function initSettings() {
  const dlg = $('settings');
  $('settingsBtn').addEventListener('click', () => {
    for (const k of ['wind', 'temp', 'dist']) {
      const el = dlg.querySelector(`input[name="${k}"][value="${U()[k]}"]`);
      if (el) el.checked = true;
    }
    dlg.showModal();
  });
  dlg.addEventListener('change', (e) => {
    if (e.target.type === 'radio') {
      state.saved.units[e.target.name] = e.target.value;
      save();
      render();
    }
  });
  $('searchBtn').addEventListener('click', () => search($('searchInput').value));
  $('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); search(e.target.value); }
  });
  $('gpsBtn').addEventListener('click', () => { dlg.close(); useGPS(); });
}

initSettings();
if (state.saved.location && !state.saved.location.gps) refresh();
else useGPS();

setInterval(refresh, REFRESH_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
