import { splitLang, safeLink } from './utils.js';
import { updateFacilityInfo } from './facilityInfo.js';

const typeIcons = {
  "Clinic": "assets/hospital.png",
  "default": "assets/general.svg",
};

export function createBaseMap() {
  const map = L.map('map', { preferCanvas: true }).setView([31.52, 34.45], 9);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
  map.zoomControl.setPosition('topright');
  return map;
}

export function createHealthMarkers(features) {
  const markers = L.markerClusterGroup();

  const layer = L.geoJSON(features, {
    pointToLayer: (feature, latlng) => {
      const iconUrl = typeIcons["Clinic"] || typeIcons["default"];
      const marker = L.marker(latlng, {
        icon: L.divIcon({
          className: '',
          html: `
            <img src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
              style="position:absolute;left:0;top:0;width:41px;height:41px;">
            <img src="${iconUrl}" style="height:32px;object-fit:contain;position:relative;z-index:1;">
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 32]
        })
      });

      marker.on('click', () => {
        updateFacilityInfo(feature.properties);
        highlightMarker(marker, "Clinic");
      });
      return marker;
    }
  });

  layer.eachLayer(l => markers.addLayer(l));
  return markers;
}

export function createCheckpointsLayer(geojson) {
  return L.markerClusterGroup().addLayer(
    L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) =>
        L.circleMarker(latlng, { radius: 4, color: "red", fillColor: "red", fillOpacity: 1 })
    })
  );
}

export function createRoadsLayer(geojson) {
  return L.geoJSON(geojson, { style: { color: "#3388ff", weight: 1.5 } });
}

export function createBordersLayer(geojson) {
  return L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) => {
      const p = feature.properties || {};
      const status = String(p.status || "").toLowerCase();
      const color = status.includes("open") ? "green" :
                    status.includes("partial") ? "orange" : "gray";
      const link = safeLink(p.source, "Source");

      return L.circleMarker(latlng, {
        radius: 6, color, fillColor: color, fillOpacity: 0.9
      }).bindPopup(`
        <strong>${p.name || "Unknown"}</strong><br>
        Type: ${p.type || "Unknown"}<br>
        Status: ${p.status || "Unknown"}<br>
        Last Updated: ${p.last_update || "Unknown"}<br>
        ${link}
      `);
    }
  });
}

// marker highlight handling
let selectedMarker = null;

export function highlightMarker(marker, typeEn) {
  if (selectedMarker) {
    const prevTypeEn = selectedMarker.options.typeEn || "";
    const prevIconUrl = typeIcons[prevTypeEn] || typeIcons["default"];
    selectedMarker.setIcon(L.divIcon({
      className: '',
      html: `
        <img src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
             style="position:absolute;left:0;top:0;width:41px;height:41px;">
        <img src="${prevIconUrl}" style="height:32px;object-fit:contain;position:relative;z-index:1;">
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    }));
  }
  const iconUrl = typeIcons[typeEn] || typeIcons["default"];
  marker.setIcon(L.divIcon({
    className: '',
    html: `
      <img src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
           style="position:absolute;left:0;top:0;width:41px;height:41px;">
      <img src="${iconUrl}" class="selected-marker"
           style="height:32px;object-fit:contain;position:relative;z-index:1;">
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  }));
  marker.options.typeEn = typeEn;
  selectedMarker = marker;
}