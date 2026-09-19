const TRACKING_HOST = /(?:^|\.)(?:google-analytics\.com|googletagmanager\.com|doubleclick\.net|googleadservices\.com|facebook\.com|connect\.facebook\.net|segment\.io|segment\.com|amplitude\.com|mixpanel\.com|sentry\.io|rollbar\.com|datadoghq\.com|newrelic\.com|clarity\.ms|hotjar\.com|tatari\.tv|branch\.io)$/i;
const TRACKING_PATH = /(?:\/collect(?:\/|$)|\/pagead\/|\/telemetry(?:\/|$)|\/events?(?:\/|$)|\/beacon(?:\/|$)|\/pixel(?:\/|$)|\/tr(?:\/|$)|\/cdn-cgi\/challenge-platform\/|\/challenge(?:\/|$)|\/metrics?(?:\/|$))/i;
const API_PATH = /(?:\/api(?:\/|$)|\/graphql(?:\/|$)|\/rpc(?:\/|$)|\/v\d+(?:\/|$)|\/initialize(?:\/|$)|\/register(?:\/|$)|\/auth(?:\/|$))/i;
const AUDIO_EXT = /\.(?:mp3|wav|ogg|m4a|flac|aac|m3u8)(?:$|\?)/i;
const STATIC_EXT = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|woff2?|ttf|otf|eot|mp4|webm)(?:$|\?)/i;

export function classifyDesignAsset(candidate, { designOnly=true } = {}) {
  if (!candidate?.url) return { include:false, reason:"missing-url" };
  if (!designOnly) return { include:true, reason:"design-only-disabled" };

  let u;
  try { u = new URL(candidate.url); }
  catch { return { include:false, reason:"invalid-url" }; }

  const type = String(candidate.type || "").toLowerCase();
  const requestPath = `${u.pathname}${u.search}`;

  if (TRACKING_HOST.test(u.hostname) || TRACKING_PATH.test(requestPath)) {
    return { include:false, reason:"analytics-telemetry-ad" };
  }
  if (type === "audio" || type.includes("audio") || AUDIO_EXT.test(requestPath)) {
    return { include:false, reason:"song-audio-stream" };
  }
  if (/resource:(?:fetch|xmlhttprequest|beacon|other)/i.test(type) && !STATIC_EXT.test(requestPath)) {
    return { include:false, reason:"runtime-api-request" };
  }
  if (API_PATH.test(requestPath) && !STATIC_EXT.test(requestPath)) {
    return { include:false, reason:"api-data-request" };
  }
  if (type === "video") {
    const decorative = Boolean(candidate.muted && (candidate.autoplay || candidate.loop));
    if (!decorative) return { include:false, reason:"content-video-not-decorative" };
  }

  const designType = /(?:image|img|icon|mask|style|stylesheet|script|module|font|preload|css-url|video-poster|manifest|resource:(?:img|image|script|css|link|font))/i.test(type);
  if (designType || STATIC_EXT.test(requestPath)) return { include:true, reason:"frontend-static-or-visual" };

  return { include:false, reason:"non-design-resource" };
}
