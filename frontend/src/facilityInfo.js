import { splitLang } from './utils.js';

export function updateFacilityInfo(props) {
  const infoBox = document.getElementById('facility-info');
  const name = props.NAME || "Unknown";
  const type = splitLang(props.TYPE);
  const services = splitLang(props.SERVICES);
  const governorate = props.GOVERNORATE || "Unknown";
  const region = props.REGION || "Unknown";
  const supervising = props.SUPERVISING || "Unknown";
  const urbanization = splitLang(props.URBANIZATION);

  infoBox.innerHTML = `
    <div class="facility-info-content">
      <div class="facility-title">${name}</div>
      <div class="facility-row">
        <span><b>Type:</b> ${type.en}</span>
        <span class="facility-ar">${type.ar}</span>
      </div>
      <div class="facility-row">
        <span><b>Services:</b> ${(services.en || "").replace(/\+/g, ", ")}</span>
        <span class="facility-ar">${(services.ar || "").replace(/\+/g, "، ")}</span>
      </div>
      <div><b>Governorate:</b> ${governorate}</div>
      <div><b>Region:</b> ${region}</div>
      <div><b>Supervising:</b> ${supervising}</div>
      <div class="facility-row">
        <span><b>Urbanization:</b> ${urbanization.en}</span>
        <span class="facility-ar">${urbanization.ar}</span>
      </div>
    </div>
  `;
}