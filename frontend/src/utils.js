export function splitLang(text) {
  if (!text || text === "Unknown") return { en: "Unknown", ar: "" };
  const [en, ar] = String(text).split("|").map(s => s.trim());
  return { en: en || "Unknown", ar: ar || "" };
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** return a safe anchor HTML for valid URLs, or empty string */
export function safeLink(href, label = "Source") {
  try {
    if (!href) return "";
    const u = new URL(href);
    // basic scheme allowlist
    if (!/^https?:$/.test(u.protocol)) return "";
    return `<a href="${u.href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  } catch {
    return "";
  }
}