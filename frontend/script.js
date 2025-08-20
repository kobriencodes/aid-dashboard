import { api } from './src/api.js';
import {
  createBaseMap, createHealthMarkers,
  createCheckpointsLayer, createRoadsLayer, createBordersLayer
} from './src/mapLayers.js';
import {
  initFilterUI, buildDropdowns, applyFilters as applyFiltersFn
} from './src/filter.js';
import { debounce } from './src/utils.js';

const map = createBaseMap();

const panel = document.getElementById('filters');
const panelBody = panel?.querySelector('.panel-body') || panel;

const markerById = new Map();  // id -> L.Marker
let clusterGroup = L.markerClusterGroup({ chunkedLoading:true });
map.addLayer(clusterGroup);

function renderDelta(idxList) {
  const next = new Set(idxList.map(i => allNorm[i]._id));
  for (const id of markerById.keys()) {
    if (!next.has(id)) {
      const m = markerById.get(id);
      clusterGroup.removeLayer(m);
      markerById.delete(id);
    }
  }
  for (const i of idxList) {
    const id = allNorm[i]._id;
    if (markerById.has(id)) continue;
    const f = allNorm[i].raw;
    const m = featureToMarker(f);
    markerById.set(id, m);
    clusterGroup.addLayer(m);
  }
}

let isPlaying = false;
let playTimer = null;

const timeSinceEl = document.getElementById('timeSince');
const includeUndatedEl = document.getElementById('includeUndated');
const timeSlider = document.getElementById('timeSlider');
const timeLabel = document.getElementById('timeLabel');

if (panel) {
  L.DomEvent.disableScrollPropagation(panel);
  L.DomEvent.disableClickPropagation(panel);
}
if (panelBody && panelBody !== panel) {
  L.DomEvent.disableScrollPropagation(panelBody);
  L.DomEvent.disableClickPropagation(panelBody);
}

if (panel) {
  panel.addEventListener('mouseenter', () => map.scrollWheelZoom.disable());
  panel.addEventListener('mouseleave', () => map.scrollWheelZoom.enable());
}

function setPresetRange(preset) {
  const now = Date.now();
  let since = null;
  if (preset === '24h') since = now - 24*3600*1000;
  else if (preset === '7d') since = now - 7*24*3600*1000;
  else if (preset === '30d') since = now - 30*24*3600*1000;
  else since = null;

  if (since) {
    const d = new Date(since);
    // normalize to local for datetime-local input
    const iso = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,16);
    timeSinceEl.value = iso;
  } else {
    timeSinceEl.value = '';
  }
}

function getTimeSinceMs() {
  const v = timeSinceEl.value;
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d) ? undefined : d.getTime();
}

function updateSliderLabel(ms) {
  timeLabel.textContent = ms ? new Date(ms).toLocaleString() : 'Now';
}

function stopTouch(e){ e.stopPropagation(); }
if (panelBody) {
  panelBody.addEventListener('touchstart', stopTouch, { passive: true });
  panelBody.addEventListener('touchmove',  stopTouch, { passive: true });
}
// ----------------------
// State
// ----------------------
let allFeatures = [];           // UNION of all datasets (health + roads + checkpoints + borders)
let healthMarkers = null;
let roadsLayer = null;
let checkpointsLayer = null;
let borderLayer = null;
let layerControl = null;

let healthFeaturesRaw = [];
let roadFeaturesRaw = [];
let checkpointFeaturesRaw = [];
let borderFeaturesRaw = [];

// ----------------------
// Loading overlay helpers
// ----------------------
const loadingEl = document.getElementById('loading');
function showLoading(on) { loadingEl?.classList.toggle('show', !!on); }
async function withLoading(fn) { showLoading(true); try { return await fn(); } finally { showLoading(false); } }

// ----------------------
// Kind detection (fallback only)
// ----------------------
function detectKind(f) {
  const p = f.properties || {};
  const tags = p.tags || {};
  const geomType = f.geometry?.type;

  if (p.kind) return String(p.kind);

  // Health centers
  if (p.TYPE || p.SERVICES || p.GOVERNORATE || p.URBANIZATION || p.NAME) return 'health_center';

  // Roads
  const highway = p.highway || tags.highway;
  if ((geomType === 'LineString' || geomType === 'MultiLineString') &&
      (highway || p.lanes || tags.lanes || p.maxspeed || tags.maxspeed || p.name || tags.name)) {
    return 'road';
  }

  // Border crossings
  const barrier = tags.barrier;
  const amenity = tags.amenity;
  const borderControl = tags.border_control;           // some exports use this
  const borderCrossing = tags.border_crossing;         // some exports use this
  const crossing = tags.crossing;                      // very rare, but seen
  // Treat explicit border-control as border crossing
  if (amenity === 'border_control' || borderControl === 'yes' || borderCrossing === 'yes' || crossing === 'border') {
    return 'border_crossing';
  }
  // Classic checkpoint
  if (barrier === 'checkpoint' || tags.checkpoint === 'yes') return 'checkpoint';

  // Named points with a country hint → checkpoint-ish
  if ((geomType === 'Point' || geomType === 'MultiPoint') &&
      (tags.name || tags['name:en'] || tags['name:ar']) &&
      (tags.is_in || p.is_in)) {
    return 'checkpoint';
  }

  return 'unknown';
}

// ----------------------
// Layer control rebuild
// ----------------------
function rebuildLayerControl() {
  const overlays = {};
  if (healthMarkers) overlays["Health Facilities"] = healthMarkers;
  if (roadsLayer) overlays["Roads"] = roadsLayer;
  if (checkpointsLayer) overlays["Checkpoints"] = checkpointsLayer;
  if (borderLayer) overlays["Border Crossings"] = borderLayer;

  if (layerControl) {
    map.removeControl(layerControl);
    layerControl = null;
  }
  layerControl = L.control.layers({}, overlays).addTo(map);
}

// ----------------------
// Rendering
// ----------------------
function clearLayers() {
  if (healthMarkers) { map.removeLayer(healthMarkers); healthMarkers = null; }
  if (roadsLayer)    { map.removeLayer(roadsLayer);    roadsLayer = null; }
  if (checkpointsLayer) { map.removeLayer(checkpointsLayer); checkpointsLayer = null; }
  if (borderLayer)      { map.removeLayer(borderLayer);      borderLayer = null; }
}

function toFC(features) {
  return { type: 'FeatureCollection', features };
}

function renderFiltered(features) {
  clearLayers();

  const health = [];
  const roads = [];
  const checkpoints = [];
  const borders = [];

  for (const f of features) {
    const kind = detectKind(f);
    if (kind === 'health_center') health.push(f);
    else if (kind === 'road') roads.push(f);
    else if (kind === 'checkpoint') checkpoints.push(f);
    else if (kind === 'border_crossing') borders.push(f);
  }

  if (health.length) {
    healthMarkers = createHealthMarkers(health);
    map.addLayer(healthMarkers);
  }
  if (roads.length) {
    roadsLayer = createRoadsLayer(toFC(roads));
    map.addLayer(roadsLayer);
  }
  if (checkpoints.length) {
    checkpointsLayer = createCheckpointsLayer(toFC(checkpoints));
    map.addLayer(checkpointsLayer);
  }
  if (borders.length) {
    borderLayer = createBordersLayer(toFC(borders));
    map.addLayer(borderLayer);
  }

  // Fit bounds to visible stuff
  const bounds = L.latLngBounds([]);
  if (healthMarkers && healthMarkers.getLayers().length) bounds.extend(healthMarkers.getBounds());
  if (checkpointsLayer) { try { bounds.extend(checkpointsLayer.getBounds()); } catch {} }
  if (borderLayer)      { try { bounds.extend(borderLayer.getBounds()); } catch {} }
  if (roadsLayer)       { try { bounds.extend(roadsLayer.getBounds()); } catch {} }
  if (bounds.isValid()) map.fitBounds(bounds.pad(0.05));

  rebuildLayerControl();
}

// ----------------------
// Filters UI wiring
// ----------------------
function applyAllFilters() {
  applyFiltersFn(allFeatures, renderFiltered);
}

initFilterUI((rebuildDropdowns) => {
  if (rebuildDropdowns) buildDropdowns(allFeatures);
  applyAllFilters();
});

// Preset buttons
document.querySelectorAll('.time-presets .btn, .time-presets .btn-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    const range = btn.getAttribute('data-range');
    setPresetRange(range);
    applyFiltersFn(allFeatures, renderFiltered);
  });
});

// Manual "since"
timeSinceEl.addEventListener('change', () => {
  applyFiltersFn(allFeatures, renderFiltered);
});

// Include-undated
includeUndatedEl.addEventListener('change', () => {
  applyFiltersFn(allFeatures, renderFiltered);
});

// Playback
const playBtn = document.getElementById('timePlay');
const pauseBtn = document.getElementById('timePause');

playBtn.addEventListener('click', () => {
  if (isPlaying) return;
  isPlaying = true;

  const start = getTimeSinceMs() ?? (Date.now() - 7*24*3600*1000); // default 7d window
  let cursor = start;
  const now = Date.now();
  const steps = 100;
  const stepMs = Math.max((now - start) / steps, 1);

  timeSlider.min = '0'; timeSlider.max = String(steps); timeSlider.value = '0';

  playTimer = setInterval(() => {
    if (!isPlaying) return;
    cursor += stepMs;
    if (cursor >= now) { cursor = now; isPlaying = false; clearInterval(playTimer); }

    // Update since based on cursor
    const d = new Date(cursor);
    const iso = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,16);
    timeSinceEl.value = iso;

    timeSlider.value = String(Math.round(((cursor - start) / (now - start)) * steps));
    updateSliderLabel(cursor);

    applyFiltersFn(allFeatures, renderFiltered);
  }, 150);
});

pauseBtn.addEventListener('click', () => {
  isPlaying = false;
  if (playTimer) clearInterval(playTimer);
});

// Manual scrub
timeSlider.addEventListener('input', () => {
  const since = getTimeSinceMs();
  if (since === undefined) return;
  const now = Date.now();
  const steps = Number(timeSlider.max) || 100;
  const p = Number(timeSlider.value) / steps;
  const cursor = Math.round(since + (now - since) * p);

  const d = new Date(cursor);
  const iso = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,16);
  timeSinceEl.value = iso;
  updateSliderLabel(cursor);

  applyFiltersFn(allFeatures, renderFiltered);
});

const searchBox = document.getElementById('searchBox');
if (searchBox) {
  const onSearch = debounce(applyAllFilters, 200);
  searchBox.addEventListener('input', onSearch);
}

const resetBtn = document.getElementById('resetFilters');
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    [
      'typeFilter','serviceFilter','urbanFilter','govFilter',
      'datasetFilter','countryFilter','highwayFilter','onewayFilter',
      'lanesMin','lanesMax','speedMin','speedMax','searchBox'
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const lang = document.getElementById('langFilter');
    if (lang) lang.value = 'en';
    buildDropdowns(allFeatures);
    applyAllFilters();
  });
}

// ----------------------
// Helpers: stamp a fixed kind on features from each endpoint
// ----------------------
function stampKind(fc, kind) {
  const features = Array.isArray(fc?.features) ? fc.features : [];
  for (const f of features) {
    f.properties = f.properties || {};
    if (!f.properties.kind) f.properties.kind = kind;
  }
  return features;
}

// ----------------------
// Initial load (fetch ALL datasets, stamp kinds, then union)
// ----------------------
withLoading(async () => {
  const [
    healthFC,
    roadsFC,
    checkpointsFC,
    bordersFC
  ] = await Promise.all([
    api.getHealth().catch(() => ({ type:'FeatureCollection', features: [] })),
    api.getRoads().catch(() => ({ type:'FeatureCollection', features: [] })),
    api.getCheckpoints().catch(() => ({ type:'FeatureCollection', features: [] })),
    api.getBorders().catch(() => ({ type:'FeatureCollection', features: [] })),
  ]);

  // Stamp kinds explicitly so filter/render never misclassifies
  healthFeaturesRaw     = stampKind(healthFC, 'health_center');
  roadFeaturesRaw       = stampKind(roadsFC, 'road');
  checkpointFeaturesRaw = stampKind(checkpointsFC, 'checkpoint');
  borderFeaturesRaw     = stampKind(bordersFC, 'border_crossing');

  allFeatures = [
    ...healthFeaturesRaw,
    ...roadFeaturesRaw,
    ...checkpointFeaturesRaw,
    ...borderFeaturesRaw
  ];

  const counts = allFeatures.reduce((acc, f) => {
    const k = detectKind(f);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  if ((counts['border_crossing'] || 0) > 0) {
    const sample = allFeatures.find(f => (f.properties?.kind || detectKind(f)) === 'border_crossing');
  }

  buildDropdowns(allFeatures);   // dropdowns from the union
  applyAllFilters();             // initial render
}).catch(err => {
  console.error("Initial load failed:", err);
});