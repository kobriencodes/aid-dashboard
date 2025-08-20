// filter.js
import { splitLang } from './utils.js';

function getStr(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null) {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return '';
}

function addVal(set, v) {
  const s = (v ?? '').toString().trim();
  if (s) set.add(s);
}

function getLoose(obj, keyName) {
  if (!obj) return '';
  const want = String(keyName).toLowerCase().trim();
  for (const k of Object.keys(obj)) {
    if (String(k).toLowerCase().trim() === want) {
      const v = obj[k];
      if (v === undefined || v === null) return '';
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return '';
}

function parseTsToMs(val) {
  if (val === undefined || val === null || val === '') return undefined;
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'number') return val < 2e10 ? val * 1000 : val; // seconds vs ms
  const d = new Date(String(val).trim());
  return isNaN(d) ? undefined : d.getTime();
}
/**
 * Detects what "kind" of feature this is, using a few heuristics:
 * - health_center: has your existing health schema (TYPE / SERVICES / etc.)
 * - road: geometry is LineString/MultiLineString and has highway/lanes/maxspeed/etc.
 * - checkpoint/border: OSM node with tags like barrier=checkpoint or amenity/border_control
 */
function detectKind(f) {
  const p = f.properties || {};
  const tags = p.tags || {};
  const geomType = f.geometry?.type;

  if (p.kind) return String(p.kind);

  // Health centers
  if (p.TYPE || p.SERVICES || p.GOVERNORATE || p.URBANIZATION || p.NAME) {
    return 'health_center';
  }

  // Roads (ways)
  const highway = p.highway || tags.highway;
  if ((geomType === 'LineString' || geomType === 'MultiLineString') && highway) {
    return 'road';
  }

  // Checkpoints / Border control
  const flatCountry = getLoose(p, 'country');
  const flatStatus  = getLoose(p, 'status');
  const flatType    = getLoose(p, 'type');
  if ((flatCountry || flatStatus || flatType) && (geomType === 'Point' || !geomType)) {
    return 'border_crossing';
  }

  const barrier = tags.barrier;
  const amenity = tags.amenity;
  const borderControl = tags.border_control;
  if (barrier === 'checkpoint') return 'checkpoint';
  if (amenity === 'border_control' || borderControl === 'yes') return 'border_crossing';

  // Fallback: checkpoint if name indicates, else unknown
  if (tags.name || tags['name:en'] || tags['name:ar']) {
    return 'checkpoint'; // better to be specific than unknown for filtering UX
  }

  return 'unknown';
}

/**
 * Normalizes mixed schemas into a unified record the UI can reason about.
 * Returned shape:
 * {
 *   kind: 'health_center' | 'checkpoint' | 'border_crossing' | 'road' | 'unknown',
 *   name: { en, ar },
 *   type: { en, ar },          // health_center or inferred (e.g., highway class for roads)
 *   services: { en, ar },      // health_center only
 *   urbanization: { en, ar },  // health_center only
 *   governorate: { en, ar },   // health_center only
 *   country: string | undefined, // checkpoints (tags.is_in)
 *   road: {
 *     highway: string|undefined,
 *     oneway: 'yes'|'no'|undefined,
 *     lanes: number|undefined,
 *     maxspeed: number|undefined
 *   },
 *   raw: original feature (for rendering)
 * }
 */
function normalizeFeature(f) {
  const p = f.properties || {};
  const tags = p.tags || {};
  const kind = detectKind(f);

  // Helper to coerce numbers
  const toNumber = (v) => {
    if (v == null) return undefined;
    const n = Number(String(v).replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  };

  // Names (bilingual)
  const name_en =
    p.NAME?.en || p['NAME:EN'] || tags['name:en'] || tags.name_en || p['name:en'] || p.NAME || tags.name || '';
  const name_ar =
    p.NAME?.ar || p['NAME:AR'] || tags['name:ar'] || tags.name_ar || p['name:ar'] || '';

  // Health-center bilinguals
  const typeObj = splitLang(p.TYPE || '');
  const servicesObj = splitLang(p.SERVICES || '');
  const urbanObj = splitLang(p.URBANIZATION || '');
  const govObj = splitLang(p.GOVERNORATE || '');

  // Roads
  const highway = p.highway || tags.highway;
  const oneway = (p.oneway ?? tags.oneway)?.toString().toLowerCase();
  const lanes = toNumber(p.lanes ?? tags.lanes);
  const maxspeed = toNumber(p.maxspeed ?? tags.maxspeed);

  // Checkpoints / borders
  const country = tags.is_in || p.is_in;

  // If not health center, supply a "type" for display/search
  const syntheticType =
    kind === 'road'
      ? { en: highway || '', ar: '' }
      : (kind === 'checkpoint' ? { en: 'Checkpoint', ar: '' } :
         kind === 'border_crossing' ? { en: 'Border Crossing', ar: '' } :
         { en: '', ar: '' });

           // ---- BORDER CROSSINGS (flat schema) ----
  // Expected props: Name, Type, Status, Latitude, Longitude, Last_Update, Source
  // You already stamp kind='border_crossing' in script.js.
  // ---- BORDER CROSSINGS (flat schema) ----
    const border = {};
    if (kind === 'border_crossing') {
    // Name fallback for flat schema
    const nameFlat = getStr(p, ['Name','NAME','name']);
    if (!name_en && nameFlat) {
        var name_en_local = nameFlat; // (intentional var for scope)
    }

    border.type       = getStr(p, ['Type','TYPE','type']);
    border.status     = getStr(p, ['Status','STATUS','status']);
    border.source     = getStr(p, ['Source','SOURCE','source']);
    border.lastUpdate = getStr(p, ['Last_Update','LAST_UPDATE','last_update','lastUpdate']);

    border.country = getStr(p, ['Country','COUNTRY','country']);
    }

      // ----- Timestamp normalization -----
      const ts =
            parseTsToMs(p.observed_ts) ||
            parseTsToMs(p.observed_at) ||
            parseTsToMs(p.last_update) ||
            parseTsToMs(p.ingested_ts) ||
            parseTsToMs(p.ingested_at) ||
            parseTsToMs(p.last_seen_ts) ||
            undefined;

    return {
    kind,
    name: {
      en: (typeof name_en_local !== 'undefined' ? name_en_local : String(name_en || '')),
      ar: String(name_ar || '')
    },
    type: kind === 'health_center' ? typeObj :
        kind === 'road' ? { en: (p.highway || tags.highway || ''), ar: '' } :
        kind === 'checkpoint' ? { en: 'Checkpoint', ar: '' } :
        kind === 'border_crossing' ? { en: (border.type || 'Border Crossing'), ar: '' } :
        { en: '', ar: '' },

    services: servicesObj,
    urbanization: urbanObj,
    governorate: govObj,

    country: (p.tags?.is_in || p.is_in || border.country || undefined),
    road: {
      highway: p.highway || tags.highway,
      oneway: ((p.oneway ?? tags.oneway)?.toString().toLowerCase() === 'yes') ? 'yes'
            : ((p.oneway ?? tags.oneway)?.toString().toLowerCase() === 'no')  ? 'no'
            : undefined,
      lanes: Number.isFinite(Number(p.lanes ?? tags.lanes)) ? Number(p.lanes ?? tags.lanes) : undefined,
      maxspeed: Number.isFinite(Number((p.maxspeed ?? tags.maxspeed))) ? Number((p.maxspeed ?? tags.maxspeed)) : undefined,
    },

    border, // <- carries .type, .status, .source, .lastUpdate for border crossings
    ts,
    raw: f,
  };
}

export function initFilterUI(applyFilters) {
  const wrapper = document.getElementById('filters-wrapper');
  const filters = document.getElementById('filters');

  document.getElementById('filters-toggle').addEventListener('click', () => {
    filters.classList.toggle('hidden');
    wrapper.classList.toggle('open', !filters.classList.contains('hidden'));
    wrapper.classList.toggle('closed', filters.classList.contains('hidden'));
  });

  // Language
  document.getElementById('langFilter').addEventListener('change', () => {
    applyFilters(true); // rebuild dropdowns
  });

  // Search
  document.getElementById('searchBox').addEventListener('input', () => applyFilters(false));

  // Any select within filters triggers apply (including new ones)
  document.querySelectorAll('#filters select, #filters input').forEach(el => {
    if (el.id !== 'langFilter' && el.id !== 'searchBox') {
      el.addEventListener('change', () => applyFilters(false));
      el.addEventListener('input', () => applyFilters(false));
    }
  });
}

/**
 * Builds dropdowns across all kinds present, and shows/hides UI sections
 * so the panel stays adaptive.
 */
export function buildDropdowns(features) {
  const normalized = features.map(normalizeFeature);
  const presentKinds = new Set(normalized.map(n => n.kind));

  // Toggle section visibility
  toggleSection('healthSection', presentKinds.has('health_center'));
  toggleSection('checkpointSection', presentKinds.has('checkpoint') || presentKinds.has('border_crossing'));
  toggleSection('roadSection', presentKinds.has('road'));
  toggleSection('borderSection', presentKinds.has('border_crossing'));

  // Dataset selector (if you want global kind filtering)
  const kindsForSelect = [];
  if (presentKinds.has('health_center')) kindsForSelect.push({ value: 'health_center', label: 'Health Centers' });
  if (presentKinds.has('checkpoint')) kindsForSelect.push({ value: 'checkpoint', label: 'Checkpoints' });
  if (presentKinds.has('border_crossing')) kindsForSelect.push({ value: 'border_crossing', label: 'Border Crossings' });
  if (presentKinds.has('road')) kindsForSelect.push({ value: 'road', label: 'Roads' });
  fillSimpleSelect('datasetFilter', kindsForSelect, true);

  // HEALTH filters
  const types = new Map();
  const services = new Map();
  const urbanizations = new Map();
  const governorates = new Map();

  // CHECKPOINT filters
  const checkpointCountries = new Set();

    // BORDER filters
  const borderCountries     = new Set();
  const borderTypes         = new Set();
  const borderStatuses      = new Set();

  // ROAD filters
  const highways = new Set();
  const oneways = new Set();
  let minLanes = Infinity, maxLanes = -Infinity;
  let minSpeed = Infinity, maxSpeed = -Infinity;

  normalized.forEach(n => {
    if (n.kind === 'health_center') {
        if (n.type?.en || n.type?.ar) types.set(n.type.en || n.type.ar, n.type);
        if (n.services?.en) n.services.en.split('+').map(s => s.trim()).filter(Boolean)
        .forEach(s => services.set(s, { en: s, ar: '' }));
        if (n.services?.ar) n.services.ar.split('+').map(s => s.trim()).filter(Boolean)
        .forEach(s => services.set(s, { en: '', ar: s }));
        if (n.urbanization?.en || n.urbanization?.ar) urbanizations.set(n.urbanization.en || n.urbanization.ar, n.urbanization);
        if (n.governorate?.en || n.governorate?.ar) governorates.set(n.governorate.en || n.governorate.ar, n.governorate);
    }

    if (n.kind === 'checkpoint') {
        if (n.country) checkpointCountries.add(n.country);
    }

    if (n.kind === 'border_crossing') {
        if (n.country) borderCountries.add(n.country);
        if (n.border?.type)   borderTypes.add(n.border.type);
        if (n.border?.status) borderStatuses.add(n.border.status);
    }

    if (n.kind === 'road') {
        if (n.road.highway) highways.add(n.road.highway);
        if (n.road.oneway)  oneways.add(n.road.oneway);
        if (Number.isFinite(n.road.lanes))    { minLanes = Math.min(minLanes, n.road.lanes); maxLanes = Math.max(maxLanes, n.road.lanes); }
        if (Number.isFinite(n.road.maxspeed)) { minSpeed = Math.min(minSpeed, n.road.maxspeed); maxSpeed = Math.max(maxSpeed, n.road.maxspeed); }
    }
  });

  // HEALTH
  fillSplitSelect('typeFilter',   Array.from(types.values()));
  fillSplitSelect('serviceFilter',Array.from(services.values()));
  fillSplitSelect('urbanFilter',  Array.from(urbanizations.values()));
  fillSplitSelect('govFilter',    Array.from(governorates.values()));

  // CHECKPOINTS
  fillSimpleSelect('checkpointCountryFilter',
  Array.from(checkpointCountries).sort().map(c => ({ value: c, label: c }))
  );

  // BORDER CROSSINGS
  fillSimpleSelect('borderCountryFilter',
  Array.from(borderCountries).sort().map(c => ({ value: c, label: c }))
  );
  fillSimpleSelect('borderTypeFilter',
  Array.from(borderTypes).sort().map(v => ({ value: v, label: v }))
  );
  fillSimpleSelect('borderStatusFilter',
  Array.from(borderStatuses).sort().map(v => ({ value: v, label: v }))
  );

  // ROADS
  fillSimpleSelect('highwayFilter', Array.from(highways).sort().map(h => ({ value: h, label: h })));
  fillSimpleSelect('onewayFilter',  Array.from(oneways).sort().map(o => ({ value: o, label: o.toUpperCase() })));

  const lanesMinEl = document.getElementById('lanesMin');
  const lanesMaxEl = document.getElementById('lanesMax');
  const speedMinEl = document.getElementById('speedMin');
  const speedMaxEl = document.getElementById('speedMax');

  if (Number.isFinite(minLanes) && Number.isFinite(maxLanes)) {
    lanesMinEl.placeholder = `min (${minLanes})`;
    lanesMaxEl.placeholder = `max (${maxLanes})`;
  } else {
    lanesMinEl.placeholder = 'min';
    lanesMaxEl.placeholder = 'max';
  }
  if (Number.isFinite(minSpeed) && Number.isFinite(maxSpeed)) {
    speedMinEl.placeholder = `min (${minSpeed})`;
    speedMaxEl.placeholder = `max (${maxSpeed})`;
  } else {
    speedMinEl.placeholder = 'min';
    speedMaxEl.placeholder = 'max';
  }
}

function toggleSection(sectionId, show) {
  const el = document.getElementById(sectionId);
  if (!el) return;
  el.classList.toggle('hidden', !show);
}

function fillSimpleSelect(selectId, items, includeAll = true) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = includeAll ? '<option value="">All</option>' : '';
  items.forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    select.appendChild(opt);
  });
}

function fillSplitSelect(selectId, values) {
  const lang = document.getElementById('langFilter').value;
  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = '<option value="">All</option>';

  values
    .filter(v => v[lang] && v[lang].trim() !== "")
    .sort((a, b) => (a[lang] || a.en).localeCompare(b[lang] || b.en))
    .forEach(v => {
      const displayText = v[lang] || v.en;
      const opt = document.createElement('option');
      opt.value = displayText;
      opt.dataset.en = v.en || '';
      opt.dataset.ar = v.ar || '';
      opt.textContent = displayText;
      select.appendChild(opt);
    });
}

export function applyFilters(features, renderMarkers) {
  const lang = document.getElementById('langFilter').value;
  const dataset = document.getElementById('datasetFilter')?.value || ''; // optional global dataset filter

  // Health
  const type = document.getElementById('typeFilter')?.value || '';
  const service = document.getElementById('serviceFilter')?.value || '';
  const urban = document.getElementById('urbanFilter')?.value || '';
  const gov = document.getElementById('govFilter')?.value || '';

  // Checkpoint/Border
  const checkpointCountry = document.getElementById('checkpointCountryFilter')?.value || '';

  // Roads
  const highway = document.getElementById('highwayFilter')?.value || '';
  const oneway = document.getElementById('onewayFilter')?.value || '';
  const lanesMin = Number(document.getElementById('lanesMin')?.value || '') || undefined;
  const lanesMax = Number(document.getElementById('lanesMax')?.value || '') || undefined;
  const speedMin = Number(document.getElementById('speedMin')?.value || '') || undefined;
  const speedMax = Number(document.getElementById('speedMax')?.value || '') || undefined;

  // Border Crossings
  const borderCountry = document.getElementById('borderCountryFilter')?.value || '';
  const borderType    = document.getElementById('borderTypeFilter')?.value || '';
  const borderStatus  = document.getElementById('borderStatusFilter')?.value || '';

  // Time
  const timeSinceInput = document.getElementById('timeSince')?.value || '';
  const includeUndated = document.getElementById('includeUndated')?.checked ?? true;
  const sinceMs = timeSinceInput ? new Date(timeSinceInput).getTime() : undefined;

  const searchQuery = document.getElementById('searchBox').value.toLowerCase().trim();

  const filtered = features
    .map(normalizeFeature)
    .filter(n => {
      // TIME window (applies if a "since" is set)
      if (sinceMs !== undefined) {
        const hasTs = Number.isFinite(n.ts);
        if (hasTs) {
          if (n.ts < sinceMs) return false;
        } else if (!includeUndated) {
          return false;
        }
      }
      // dataset gate, if used
      if (dataset && n.kind !== dataset) return false;

      // Text search across bilingual name + type
      if (searchQuery) {
        const nameEn = n.name.en.toLowerCase();
        const nameAr = n.name.ar.toLowerCase();
        const typeEn = (n.type?.en || '').toLowerCase();
        const typeAr = (n.type?.ar || '').toLowerCase();
        const matches =
          nameEn.includes(searchQuery) ||
          nameAr.includes(searchQuery) ||
          typeEn.includes(searchQuery) ||
          typeAr.includes(searchQuery);
        if (!matches) return false;
      }

      // HEALTH filters
      if (n.kind === 'health_center') {
        const typeMatch = !type ||
          (n.type?.[lang] && n.type[lang].includes(type)) ||
          (n.type?.en && n.type.en.includes(type));

        const serviceMatch = !service ||
          (n.services?.[lang] && n.services[lang].includes(service)) ||
          (n.services?.en && n.services.en.includes(service));

        const urbanMatch = !urban ||
          (n.urbanization?.[lang] && n.urbanization[lang].includes(urban)) ||
          (n.urbanization?.en && n.urbanization.en.includes(urban));

        const govMatch = !gov ||
          (n.governorate?.[lang] && n.governorate[lang].includes(gov)) ||
          (n.governorate?.en && n.governorate.en.includes(gov));

        return typeMatch && serviceMatch && urbanMatch && govMatch;
      }

      // ROAD filters
      if (n.kind === 'road') {
        const highwayMatch = !highway || n.road.highway === highway;
        const onewayMatch = !oneway || n.road.oneway === oneway;

        let lanesMatch = true;
        if (lanesMin !== undefined && Number.isFinite(lanesMin)) lanesMatch = lanesMatch && Number(n.road.lanes ?? Infinity) >= lanesMin;
        if (lanesMax !== undefined && Number.isFinite(lanesMax)) lanesMatch = lanesMatch && Number(n.road.lanes ?? -Infinity) <= lanesMax;

        let speedMatch = true;
        if (speedMin !== undefined && Number.isFinite(speedMin)) speedMatch = speedMatch && Number(n.road.maxspeed ?? Infinity) >= speedMin;
        if (speedMax !== undefined && Number.isFinite(speedMax)) speedMatch = speedMatch && Number(n.road.maxspeed ?? -Infinity) <= speedMax;

        return highwayMatch && onewayMatch && lanesMatch && speedMatch;
      }

        // CHECKPOINTS
        if (n.kind === 'checkpoint') {
        const countryMatch = !checkpointCountry || (n.country && n.country.toLowerCase() === checkpointCountry.toLowerCase());
        return countryMatch;
        }

        // BORDER CROSSINGS
        if (n.kind === 'border_crossing') {
        const countryMatch = !borderCountry || (n.country && n.country.toLowerCase() === borderCountry.toLowerCase());
        const typeMatch    = !borderType   || (n.border?.type   || '').toLowerCase() === borderType.toLowerCase();
        const statusMatch  = !borderStatus || (n.border?.status || '').toLowerCase() === borderStatus.toLowerCase();
        return countryMatch && typeMatch && statusMatch;
        }

      // Unknown kinds are allowed through unless dataset filter is set
      return true;
    })
    .map(n => n.raw);

  renderMarkers(filtered);
}