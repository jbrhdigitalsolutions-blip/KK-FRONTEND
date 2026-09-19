export const KNOWN_LOCALES = new Set([
  "en","en-us","en-gb","es","es-es","es-mx","fr","fr-fr","de","de-de","it","it-it",
  "pt","pt-br","pt-pt","ja","ko","zh","zh-cn","zh-tw","th","id","vi","ru","tr","pl",
  "nl","sv","no","da","fi","cs","hu","ro","uk","ar","he","hi","bn","ta","te","mr",
  "ms","fil","el","bg","hr","sk","sl","sr","et","lv","lt"
]);

const CONTENT_ROOT_PARAMS = Object.freeze({
  song: "songId", songs: "songId",
  track: "trackId", tracks: "trackId",
  playlist: "playlistId", playlists: "playlistId",
  album: "albumId", albums: "albumId",
  profile: "slug", profiles: "slug",
  artist: "slug", artists: "slug",
  user: "slug", users: "slug",
  station: "stationId", stations: "stationId",
  share: "shareId",
  clip: "clipId", clips: "clipId",
  generation: "generationId", generations: "generationId",
  remix: "remixId", remixes: "remixId"
});

const STRUCTURAL_QUERY_KEYS = new Set(["tab","view","mode","type","section","layout"]);
const CONTENT_QUERY_KEYS = /^(?:q|query|search|keyword|id|song(?:id)?|track(?:id)?|playlist(?:id)?|album(?:id)?|artist(?:id)?|profile(?:id)?|user(?:id)?|slug|cursor|page|offset|token)$/i;

export function compilePattern(value, label = "Route") {
  if (!value || !String(value).trim()) return null;
  try { return new RegExp(String(value), "i"); }
  catch (e) { throw new Error(`${label} regex is invalid: ${e.message}`); }
}

export function stripKnownLocale(pathname) {
  const parts = String(pathname || "/").split("/").filter(Boolean);
  if (!parts.length) return { pathname:"/", locale:null };
  const first = parts[0].toLowerCase();
  if (!KNOWN_LOCALES.has(first)) return { pathname: pathname || "/", locale:null };
  const rest = parts.slice(1);
  return { pathname: rest.length ? `/${rest.join("/")}` : "/", locale:first };
}

export function canonicalizeRoute(url, { scanLocaleVariants=false } = {}) {
  const u = new URL(url);
  const originalPath = u.pathname || "/";
  const stripped = stripKnownLocale(originalPath);
  if (!scanLocaleVariants && stripped.locale) u.pathname = stripped.pathname;
  return {
    canonicalUrl: u.href,
    canonicalPath: `${u.pathname}${u.search}`,
    originalPath,
    locale: stripped.locale,
    wasLocaleAlias: Boolean(stripped.locale && !scanLocaleVariants),
  };
}

function opaqueSegment(segment) {
  const s = String(segment || "");
  if (!s) return false;
  if (/^\d{5,}$/.test(s)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(s)) return true;
  if (/^[0-9a-f]{16,}$/i.test(s)) return true;
  if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return true;
  return false;
}

export function designTemplateForRoute(url, { designOnly=true } = {}) {
  const u = new URL(url);
  if (!designOnly) {
    return {
      templateKey: `${u.pathname}${u.search}`,
      templatePath: u.pathname || "/",
      family: "exact-route",
      dynamic: false,
      reason: "design-only-disabled",
    };
  }

  const parts = u.pathname.split("/").filter(Boolean);
  const root = (parts[0] || "").toLowerCase();
  let dynamic = false;
  let family = root || "root";
  let reason = "static-route";
  const templated = [...parts];

  if (CONTENT_ROOT_PARAMS[root] && parts.length >= 2) {
    templated[1] = `:${CONTENT_ROOT_PARAMS[root]}`;
    dynamic = true;
    reason = `content-family:${root}`;
    for (let i = 2; i < templated.length; i++) {
      if (opaqueSegment(templated[i])) templated[i] = ":id";
    }
  } else {
    for (let i = 0; i < templated.length; i++) {
      if (opaqueSegment(templated[i])) {
        templated[i] = ":id";
        dynamic = true;
        reason = "opaque-id-segment";
      }
    }
  }

  const qp = [];
  for (const [k, v] of u.searchParams.entries()) {
    if (CONTENT_QUERY_KEYS.test(k)) continue;
    if (STRUCTURAL_QUERY_KEYS.has(k.toLowerCase())) qp.push([k, v]);
  }
  qp.sort(([a],[b]) => a.localeCompare(b));

  const templatePath = templated.length ? `/${templated.join("/")}` : "/";
  const query = qp.length ? `?${qp.map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}` : "";

  return {
    templateKey: `${templatePath}${query}`,
    templatePath,
    family,
    dynamic,
    reason,
  };
}

export function routeMatchesScope(url, includeRe, excludeRe) {
  const u = new URL(url);
  const value = `${u.pathname}${u.search}`;
  if (includeRe && !includeRe.test(value)) return false;
  if (excludeRe && excludeRe.test(value)) return false;
  return true;
}
