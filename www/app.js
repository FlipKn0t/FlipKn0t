import {
  GO, CAUTION, NOGO, WMO, evaluate, hourAt, currentConditions, currentHourIndex, parseKp,
} from './conditions.js';
import {
  DRONES, SERIES, DEFAULT_DRONE_ID, getDrone, sanitizeCustom, weightClass,
} from './drones.js';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'flight-check';
const LEGACY_KEY = 'neo2-flight-check';
const REFRESH_MS = 10 * 60 * 1000;

const Cap = window.Capacitor;
const isNative = !!Cap?.isNativePlatform?.();
const NativeGeo = Cap?.Plugins?.Geolocation;

const HOURLY_VARS = [
  'temperature_2m', 'dew_point_2m', 'precipitation_probability', 'precipitation', 'weather_code',
  'visibility', 'wind_speed_10m', 'wind_speed_80m', 'wind_gusts_10m', 'wind_direction_10m',
  'is_day', 'cloud_cover',
];
const CURRENT_VARS = [
  'temperature_2m', 'dew_point_2m', 'precipitation', 'weather_code', 'cloud_cover',
  'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'is_day', 'visibility',
];

// ---------- settings ----------
function defaultUnits() {
  const lang = navigator.language || '';
  const us = /-(US|LR|MM)$/i.test(lang);
  const gb = /-GB$/i.test(lang);
  return { wind: us || gb ? 'mph' : 'kmh', temp: us ? 'F' : 'C', dist: us || gb ? 'mi' : 'km' };
}
function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY))
      || JSON.parse(localStorage.getItem(LEGACY_KEY)) || {};
  } catch { return {}; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state.saved)); } catch { /* storage unavailable */ }
}

const state = { saved: load(), data: null, kp: null, selected: null };
state.saved.units = { ...defaultUnits(), ...state.saved.units };
const drone = () => getDrone(state.saved.droneId || DEFAULT_DRONE_ID, state.saved.custom);

// ---------- formatting ----------
const U = () => state.saved.units;
const WIND_UNIT = { mph: 'mph', kmh: 'km/h', ms: 'm/s', kn: 'kn' };
function windNum(ms) {
  if (ms == null) return null;
  switch (U().wind) {
    case 'mph': return Math.round(ms * 2.23694);
    case 'kmh': return Math.round(ms * 3.6);
    case 'kn': return Math.round(ms * 1.94384);
    default: return Math.round(ms * 10) / 10;
  }
}
const fmtWind = (ms) => (ms == null ? '–' : `${windNum(ms)} ${WIND_UNIT[U().wind]}`);
const tempNum = (c) => (c == null ? null : Math.round(U().temp === 'F' ? c * 9 / 5 + 32 : c));
const fmtTemp = (c) => (c == null ? '–' : `${tempNum(c)}°${U().temp}`);
const fmtTempDelta = (c) => `${Math.round(U().temp === 'F' ? c * 9 / 5 : c)}°${U().temp}`;
function distParts(m) {
  if (m == null) return ['–', ''];
  if (U().dist === 'mi') {
    const mi = m / 1609.34;
    return mi >= 10 ? ['10+', 'mi'] : [mi.toFixed(mi < 1 ? 2 : 1), 'mi'];
  }
  const km = m / 1000;
  return km >= 16 ? ['16+', 'km'] : [km.toFixed(km < 1 ? 2 : 1), 'km'];
}
const fmtDist = (m) => distParts(m).join(' ').trim();
const fmtAlt = (m) => (U().dist === 'mi'
  ? `${Math.round(m * 3.28084).toLocaleString()} ft` : `${Math.round(m).toLocaleString()} m`);
const fmtWeight = (g) => (U().temp === 'F' && g >= 250
  ? `${g.toLocaleString()} g (${(g / 453.6).toFixed(1)} lb)` : `${g.toLocaleString()} g`);
function compass(deg) {
  if (deg == null) return '';
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
}
// Open-Meteo returns local wall-clock strings ("2026-11-07T14:00"). Format them as-is,
// without converting through the device's time zone.
function fmtClock(iso, opts = { hour: 'numeric', minute: '2-digit' }) {
  if (!iso) return '–';
  const [d, t] = iso.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, mo - 1, da, h, mi)));
}
const fmtHour = (iso) => fmtClock(iso, { hour: 'numeric' });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const numHTML = (n, unit) => `${esc(n)}<small>${esc(unit)}</small>`;

const VERDICT = {
  [GO]: { tag: 'Ready to fly', title: 'Good to fly' },
  [CAUTION]: { tag: 'Caution', title: 'Fly with caution' },
  [NOGO]: { tag: 'Not safe', title: 'Don’t fly' },
};

function valueFor(check, w) {
  switch (check.id) {
    case 'wind': return `${fmtWind(w.windMs)} ${compass(w.windDir)}`;
    case 'gusts': return fmtWind(w.gustMs);
    case 'aloft': return `${fmtWind(w.wind80Ms)} @ 80 m`;
    case 'precip': {
      const parts = [];
      if (w.precipProb != null) parts.push(`${w.precipProb}%`);
      if (w.precipMm) parts.push(`${w.precipMm} mm`);
      return parts.join(' · ');
    }
    case 'visibility': return fmtDist(w.visibilityM);
    case 'temp': return fmtTemp(w.tempC);
    case 'fog': return `Δ ${fmtTempDelta(w.tempC - w.dewPointC)}`;
    case 'daylight': return w.isDay ? 'Day' : 'Night';
    case 'kp': return `Kp ${state.kp}`;
    case 'elevation': return fmtAlt(state.data.elevation);
    default: return '';
  }
}

// ---------- rendering ----------
const ctx = () => ({ kp: state.kp, elevationM: state.data?.elevation });

function renderHeader() {
  $('droneName').textContent = drone().name;
  if (state.saved.location) $('locName').textContent = state.saved.location.name;
}

function render() {
  renderHeader();
  renderDroneCard();
  const data = state.data;
  if (!data) return;
  const spec = drone();
  const nowIdx = currentHourIndex(data);
  const sel = state.selected;
  const w = sel == null ? currentConditions(data) : hourAt(data.hourly, sel);
  const result = evaluate(w, ctx(), spec);
  const byId = Object.fromEntries(result.checks.map((c) => [c.id, c]));
  const when = sel == null ? null : fmtClock(w.time, { weekday: 'short', hour: 'numeric' });

  // hero
  const v = VERDICT[result.level];
  $('hero').dataset.level = result.level;
  $('statusTag').textContent = when ? `${v.tag} · ${when}` : `${v.tag} · Now`;
  $('heroTitle').textContent = v.title;
  const worstCheck = result.checks.find((c) => c.level === result.level && c.level !== GO);
  $('heroSub').textContent = [WMO[w.weatherCode], worstCheck?.detail].filter(Boolean).join('. ')
    || `Within the ${spec.name}’s limits`;

  // wind meter (scale runs to 125% of the aircraft's rated wind limit)
  const scale = spec.maxWindMs * 1.25;
  const pct = (ms) => `${Math.min(100, Math.max(0, (ms / scale) * 100))}%`;
  $('meter').hidden = false;
  $('meterLimit').textContent = `Limit ${fmtWind(spec.maxWindMs)}`;
  const zones = $('meter').querySelectorAll('.meter-zones i');
  zones[0].style.width = pct(spec.maxWindMs * 0.5);
  zones[1].style.width = pct(spec.maxWindMs * 0.5);
  zones[2].style.flex = '1';
  $('meterFill').style.width = pct(w.windMs ?? 0);
  $('meterGust').style.left = pct(w.gustMs ?? 0);
  $('meterGust').hidden = w.gustMs == null;
  $('meterLimitLine').style.left = pct(spec.maxWindMs);
  const unit = WIND_UNIT[U().wind];
  $('roWind').innerHTML = numHTML(`${windNum(w.windMs) ?? '–'}`, ` ${unit} ${compass(w.windDir)}`);
  $('roGust').innerHTML = numHTML(`${windNum(w.gustMs) ?? '–'}`, ` ${unit}`);
  $('roAloft').innerHTML = numHTML(`${windNum(w.wind80Ms) ?? '–'}`, ` ${unit}`);

  // tiles
  const daily = data.daily || {};
  const dayIdx = Math.max(0, (daily.time || []).indexOf((w.time || '').slice(0, 10)));
  const sunEvent = w.isDay
    ? { label: 'Sunset', t: daily.sunset?.[dayIdx] }
    : { label: 'Sunrise', t: daily.sunrise?.[w.time < (daily.sunrise?.[dayIdx] || '') ? dayIdx : dayIdx + 1] };
  const [visN, visU] = distParts(w.visibilityM);
  const tiles = [
    { label: 'Temp', level: byId.temp?.level, html: numHTML(tempNum(w.tempC) ?? '–', `°${U().temp}`) },
    { label: 'Rain', level: byId.precip?.level, html: numHTML(w.precipProb ?? '–', '%') },
    { label: 'Visibility', level: byId.visibility?.level, html: numHTML(visN, ` ${visU}`) },
    { label: 'Cloud', level: null, html: numHTML(w.cloudCover ?? '–', '%') },
    { label: 'Kp · GPS', level: byId.kp?.level, html: state.kp != null ? esc(state.kp.toFixed(1)) : '–' },
    { label: sunEvent.label, level: byId.daylight?.level, html: esc(fmtClock(sunEvent.t)) },
  ];
  $('tiles').innerHTML = tiles.map((t) => `
    <div class="tile">
      <div class="tile-top"><span class="label">${esc(t.label)}</span><span class="pip ${t.level || ''}"></span></div>
      <span class="num">${t.html}</span>
    </div>`).join('');

  // checks
  $('checksTitle').textContent = when ? `Pre-flight check · ${when}` : 'Pre-flight check';
  const order = { [NOGO]: 0, [CAUTION]: 1, [GO]: 2 };
  $('checks').innerHTML = [...result.checks]
    .sort((a, b) => order[a.level] - order[b.level])
    .map((c) => `<li><span class="pip ${c.level}"></span>
      <span class="c-label">${esc(c.label)}</span><span class="c-value">${esc(valueFor(c, w))}</span>
      <span class="c-detail">${esc(c.detail)}</span></li>`).join('');

  // timeline (next 24 h)
  const start = Math.max(nowIdx, 0);
  const end = Math.min(start + 24, data.hourly.time.length);
  const hours = [];
  for (let i = start; i < end; i++) {
    // The "Now" slot uses live conditions so it agrees with the headline verdict.
    const hw = i === nowIdx ? currentConditions(data) : hourAt(data.hourly, i);
    hours.push({ i, w: hw, level: evaluate(hw, ctx(), spec).level });
  }
  const tl = $('timeline');
  tl.replaceChildren(...hours.map(({ i, w: hw, level }) => {
    const b = document.createElement('button');
    b.className = `hour ${level}`;
    b.setAttribute('role', 'listitem');
    b.setAttribute('aria-pressed', String(sel === i || (sel == null && i === nowIdx)));
    b.setAttribute('aria-label', `${fmtHour(hw.time)}: ${VERDICT[level].title}`);
    b.innerHTML = `<div class="h-time">${esc(i === nowIdx ? 'Now' : fmtHour(hw.time))}</div>
      <div class="h-bar"></div>
      <span class="h-val">${esc(windNum(hw.gustMs ?? hw.windMs) ?? '–')} ${esc(unit)}</span>
      <span class="h-val">${esc(hw.precipProb ?? 0)}%</span>`;
    b.addEventListener('click', () => {
      state.selected = (sel === i || i === nowIdx) ? null : i;
      render();
    });
    return b;
  }));
  $('bestWindow').textContent = bestWindowText(hours, nowIdx);

  $('updated').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function renderDroneCard() {
  const d = drone();
  const wc = weightClass(d.weightG);
  const specs = [
    ['Max wind', `${fmtWind(d.maxWindMs)}${d.windLevel ? ` · L${d.windLevel}` : ''}`],
    ['Operating temp', `${fmtTemp(d.minTempC)} to ${fmtTemp(d.maxTempC)}`],
    ['Max takeoff alt.', fmtAlt(d.maxTakeoffAltitudeM)],
    ['Flight time', d.flightTimeMin ? `${d.flightTimeMin} min` : '–'],
  ];
  const unverified = d.unverified?.length
    ? ' Some of these limits aren’t confirmed by the manufacturer yet, so check your manual.' : '';
  $('droneCard').innerHTML = `
    <div class="panel-head"><h2>Your aircraft</h2>
      <button type="button" class="text-btn" id="changeDrone">Change</button></div>
    <p class="drone-title">${esc(d.name)}</p>
    <p class="drone-class">${esc(d.weightG ? fmtWeight(d.weightG) : '')}${wc ? ` · ${esc(wc.label)}` : ''}</p>
    <dl class="specs">${specs.map(([k, v]) => `<div><dt class="label">${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    ${d.notes || wc || unverified ? `<p class="drone-note">${esc([d.notes, wc?.detail].filter(Boolean).join(' ') + unverified)}</p>` : ''}`;
  $('changeDrone').addEventListener('click', openDronePicker);
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
  const today = hours[0].w.time.slice(0, 10);
  const at = (h) => `${h.w.time.slice(0, 10) === today ? '' : 'tomorrow '}${fmtHour(h.w.time)}`;
  const range = (r) => {
    const next = hours[hours.indexOf(r.end) + 1];
    return next ? `${at(r.start)} – ${fmtHour(next.w.time)}` : `from ${at(r.start)}`;
  };
  if (!runs.length) {
    const caution = hours.find((h) => h.level === CAUTION);
    return caution
      ? `No fully clear hours in the next 24 h. Best chance from ${at(caution)}, with caution.`
      : 'No flyable hours in the next 24 h.';
  }
  const first = runs[0];
  if (first.start.i === nowIdx) {
    const next = hours[hours.indexOf(first.end) + 1];
    return next ? `Clear to fly now, until about ${fmtHour(next.w.time)}.` : 'Clear to fly for the next 24 hours.';
  }
  const longest = runs.reduce((a, b) => (b.end.i - b.start.i > a.end.i - a.start.i ? b : a));
  const txt = `Next window: ${range(first)}.`;
  return longest === first ? txt : `${txt} Longest: ${range(longest)}.`;
}

function showError(msg) {
  $('hero').dataset.level = 'loading';
  $('statusTag').textContent = 'No data';
  $('heroTitle').textContent = 'Can’t load conditions';
  $('heroSub').textContent = msg;
  $('meter').hidden = true;
}

// ---------- drone picker ----------
function openDronePicker() {
  const current = state.saved.droneId || (state.saved.droneChosen ? DEFAULT_DRONE_ID : null);
  const meta = (d) => `${d.weightG} g · ${fmtWind(d.maxWindMs)} max wind${d.windLevel ? ` · L${d.windLevel}` : ''}`;
  $('droneList').innerHTML = SERIES.map((s) => {
    const items = DRONES.filter((d) => d.series === s.id);
    if (!items.length) return '';
    return `<div class="group"><h3>${esc(s.name)}</h3><div class="group-list" role="radiogroup">
      ${items.map((d) => `<button type="button" class="drone-row" role="radio" data-id="${esc(d.id)}"
        aria-checked="${d.id === current}"><span class="dr-name">${esc(d.name)}</span>
        <span class="dr-meta">${esc(meta(d))}</span><span class="dr-check" aria-hidden="true"></span></button>`).join('')}
    </div></div>`;
  }).join('');
  $('customRow').setAttribute('aria-checked', String(current === 'custom'));
  $('customForm').hidden = current !== 'custom';
  const c = getDrone('custom', state.saved.custom);
  $('cName').value = state.saved.custom?.name || '';
  $('cWind').value = c.maxWindMs;
  $('cMinT').value = c.minTempC;
  $('cMaxT').value = c.maxTempC;
  $('cAlt').value = c.maxTakeoffAltitudeM;
  $('cWeight').value = c.weightG;
  $('dronePicker').showModal();
}

function chooseDrone(id) {
  state.saved.droneId = id;
  state.saved.droneChosen = true;
  save();
  render();
}

function initDronePicker() {
  $('droneBtn').addEventListener('click', openDronePicker);
  $('droneList').addEventListener('click', (e) => {
    const row = e.target.closest('.drone-row');
    if (!row) return;
    chooseDrone(row.dataset.id);
    $('dronePicker').close();
  });
  $('customRow').addEventListener('click', () => {
    $('customForm').hidden = false;
    $('customRow').setAttribute('aria-checked', 'true');
    document.querySelectorAll('#droneList .drone-row').forEach((r) => r.setAttribute('aria-checked', 'false'));
    $('cWind').focus();
  });
  $('customSave').addEventListener('click', () => {
    state.saved.custom = sanitizeCustom({
      name: $('cName').value, maxWindMs: $('cWind').value, minTempC: $('cMinT').value,
      maxTempC: $('cMaxT').value, maxTakeoffAltitudeM: $('cAlt').value, weightG: $('cWeight').value,
    });
    chooseDrone('custom');
    $('dronePicker').close();
  });
}

// ---------- data ----------
async function fetchWeather(lat, lon) {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lon.toFixed(4),
    current: CURRENT_VARS.join(','), hourly: HOURLY_VARS.join(','),
    daily: 'sunrise,sunset', wind_speed_unit: 'ms', timezone: 'auto', forecast_days: '3',
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${p}`);
  if (!r.ok) throw new Error(`The weather service returned an error (${r.status}).`);
  return r.json();
}
async function fetchKp() {
  try {
    const r = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json');
    return r.ok ? parseKp(await r.json()) : null;
  } catch { return null; }
}

let inflight = null;
async function refresh() {
  const loc = state.saved.location;
  if (!loc || inflight) return inflight;
  renderHeader();
  inflight = (async () => {
    try {
      const [data, kp] = await Promise.all([fetchWeather(loc.lat, loc.lon), fetchKp()]);
      state.data = data;
      state.kp = kp;
      if (state.selected != null && state.selected < currentHourIndex(data)) state.selected = null;
      render();
    } catch (e) {
      showError(navigator.onLine === false ? 'You appear to be offline.' : e.message);
    } finally { inflight = null; }
  })();
  return inflight;
}

function setLocation(loc) {
  state.saved.location = loc;
  state.selected = null;
  save();
  refresh();
}

async function getPosition() {
  if (isNative && NativeGeo) {
    return NativeGeo.getCurrentPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
  }
  if (!('geolocation' in navigator)) throw new Error('unavailable');
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject,
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }));
}

async function useGPS() {
  $('locName').textContent = 'Locating…';
  try {
    const { coords: { latitude: lat, longitude: lon } } = await getPosition();
    setLocation({ lat, lon, name: `Current location · ${lat.toFixed(2)}, ${lon.toFixed(2)}`, gps: true });
  } catch {
    $('locName').textContent = 'Set location';
    showError('Location access is off. Tap the location at the top to search for a place.');
  }
}

async function search(q) {
  const list = $('searchResults');
  list.replaceChildren();
  if (!q.trim()) return;
  const msg = (t) => { const li = document.createElement('li'); li.textContent = t; list.append(li); };
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: q, count: '6' })}`);
    const results = (await r.json()).results || [];
    if (!results.length) { msg('No matches.'); return; }
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
  } catch { msg('Search failed. Check your connection.'); }
}

// ---------- wiring ----------
function initSettings() {
  const dlg = $('settings');
  $('locBtn').addEventListener('click', () => {
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

// Close sheets when the backdrop is tapped.
for (const dlg of document.querySelectorAll('dialog.sheet')) {
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
}

initSettings();
initDronePicker();
render();
if (state.saved.location && !state.saved.location.gps) refresh();
else useGPS();
if (!state.saved.droneId) openDronePicker();

setInterval(refresh, REFRESH_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});

if (!isNative && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
