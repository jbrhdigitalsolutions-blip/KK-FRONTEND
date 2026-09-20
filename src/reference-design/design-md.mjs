const UNKNOWN = "UNKNOWN — DO NOT INVENT";

export function normalizeReferenceUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("Reference URL is required.");
  let url;
  try { url = new URL(raw); } catch { throw new Error("Enter a valid absolute http(s) URL."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http(s) reference URLs are supported.");
  if (url.username || url.password) throw new Error("Reference URLs with embedded credentials are not supported.");
  url.hash = "";
  return url.toString();
}

export function classifyCandidate({ tag = "", role = "", className = "", label = "", animation = false, interactive = false } = {}) {
  const t = String(tag).toLowerCase();
  const r = String(role).toLowerCase();
  const c = String(className).toLowerCase();
  const l = String(label).toLowerCase();
  const s = c + " " + l;

  if (t === "header" || r === "banner" || /(^|[-_ ])header|topbar|appbar/.test(c)) return "Header";
  if (t === "footer" || r === "contentinfo" || /(^|[-_ ])footer/.test(c)) return "Footer";
  if (t === "nav" || r === "navigation" || /(^|[-_ ])nav|navbar|menu-bar/.test(c)) return "Navigation";
  if (t === "aside" || r === "complementary" || /sidebar|side-nav|sidenav/.test(c)) return "Sidebar";
  if (t === "main" || r === "main" || /workspace|dashboard|editor|app-shell/.test(c)) return "Workspace";
  if (/hero|masthead|jumbotron/.test(s)) return "Hero";
  if (/carousel|slider|swiper/.test(s)) return "Carousel";
  if (/gallery|masonry/.test(s)) return "Gallery";
  if (/pricing|testimonial|feature|section/.test(s) || t === "section") return "Section";
  if (/card|tile|panel|surface/.test(c)) return "Card";
  if (t === "form" || r === "form") return "Form";
  if (["input","textarea","select"].includes(t) || r === "textbox" || r === "combobox" || /input|field|search-box/.test(c)) return /search/.test(s) ? "Search" : "Input";
  if (t === "button" || r === "button" || /(^|[-_ ])btn|button|cta/.test(c)) return "Button";
  if (t === "img" || t === "picture" || /image|thumbnail|artwork|cover/.test(c)) return "Image";
  if (t === "video" || /video|player/.test(c)) return "Video";
  if (t === "svg" || /icon|logo/.test(c)) return /logo/.test(s) ? "Logo" : "Icon";
  if (/badge|chip|pill|tag/.test(c)) return "Badge";
  if (r === "tab" || /tabs?|tab-list/.test(c)) return "Tabs";
  if (t === "ul" || t === "ol" || r === "list" || /(^|[-_ ])list|feed/.test(c)) return "List";
  if (/grid|columns|row/.test(c)) return "Grid";
  if (/avatar|profile-image/.test(c)) return "Avatar";
  if (t === "dialog" || r === "dialog" || /modal|drawer|sheet|popover|tooltip/.test(c)) return "Overlay";
  if (/^h[1-6]$/.test(t) || t === "p" || r === "heading" || /headline|heading|title|subtitle|caption|eyebrow/.test(c)) return "Typography";
  if (animation) return "Animation";
  if (interactive) return "Interactive";
  return "Component";
}

export function candidateFamily(kind) {
  if (["Header","Footer","Navigation","Sidebar","Workspace","Hero","Section","Grid","Card","List"].includes(kind)) return "Structure";
  if (["Button","Form","Input","Search","Tabs","Badge","Interactive"].includes(kind)) return "Controls";
  if (["Image","Video","Carousel","Gallery","Icon","Logo","Avatar"].includes(kind)) return "Media";
  if (["Typography"].includes(kind)) return "Content";
  if (kind === "Animation") return "Motion";
  if (kind === "Overlay") return "Structure";
  return "Components";
}

function arr(v) { return Array.isArray(v) ? v : []; }
function text(v) { return v == null || v === "" ? UNKNOWN : String(v); }
function num(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
}
function px(v) { const n = num(v); return n == null ? UNKNOWN : String(Math.round(n * 100) / 100); }
function uniq(values) { return [...new Set(arr(values).filter(v => v != null && v !== ""))]; }
function topFrequency(values, limit = 12) {
  const counts = new Map();
  for (const value of values) {
    if (value == null || value === "" || value === "none" || value === "normal") continue;
    const key = String(value).trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([value, count]) => ({ value, count }));
}
function allElements(evidence) { return arr(evidence?.viewports).flatMap(v => arr(v.elements)); }
function allScopes(evidence) { return arr(evidence?.viewports).flatMap(v => arr(v.scopes)); }
function firstViewport(evidence, name) { return arr(evidence?.viewports).find(v => v.name === name) || arr(evidence?.viewports)[0] || {}; }
function firstElement(evidence, predicate) { return allElements(evidence).find(predicate) || allScopes(evidence).find(predicate) || null; }
function styleOf(el, key) { return el?.style?.[key] ?? null; }
function rectOf(el, key) { return el?.rect?.[key] ?? null; }
function observedMinInteractive(evidence) {
  const dims = allElements(evidence).filter(e => e.interactive).flatMap(e => [num(e.rect?.width), num(e.rect?.height)]).filter(n => n > 0);
  return dims.length ? Math.min(...dims) : null;
}
function dominantStyle(evidence, key, limit = 12) { return topFrequency(allElements(evidence).map(e => styleOf(e, key)), limit); }
function dominantValue(evidence, key) { return dominantStyle(evidence, key, 1)[0]?.value || null; }
function mediaBreakpoints(mediaQueries = []) {
  const out = [];
  for (const query of arr(mediaQueries)) {
    const re = /(?:min|max)-width\s*:\s*([\d.]+)px/gi;
    for (const match of String(query).matchAll(re)) out.push(Number(match[1]));
  }
  return uniq(out).sort((a, b) => a - b);
}
function selectedLabel(evidence) {
  if (evidence?.scope === "whole") return "Whole Page";
  const labels = arr(evidence?.selection).map(x => x.label || x.selector).filter(Boolean);
  return labels.length ? labels.join(", ") : "Selected Reference Scope";
}
function representativeBy(evidence, fn) { return allElements(evidence).find(fn) || null; }
function buttonRep(evidence) { return representativeBy(evidence, e => e.tag === "button" || e.role === "button" || e.kind === "Button"); }
function inputRep(evidence) { return representativeBy(evidence, e => ["input", "textarea", "select"].includes(e.tag)); }
function cardRep(evidence) { return representativeBy(evidence, e => /card/i.test(e.className || "")); }
function navRep(evidence) { return representativeBy(evidence, e => e.tag === "nav" || e.role === "navigation" || e.kind === "Navigation"); }
function sidebarRep(evidence) { return representativeBy(evidence, e => e.kind === "Sidebar" || e.tag === "aside"); }
function headerRep(evidence) { return representativeBy(evidence, e => e.kind === "Header" || e.tag === "header"); }
function footerRep(evidence) { return representativeBy(evidence, e => e.kind === "Footer" || e.tag === "footer"); }
function heroRep(evidence) { return representativeBy(evidence, e => /hero/i.test(e.className || "") || /hero/i.test(e.label || "")); }
function headingRep(evidence, level) { return representativeBy(evidence, e => e.tag === `h${level}`); }
function bodyRep(evidence) { return representativeBy(evidence, e => e.tag === "p") || representativeBy(evidence, e => e.tag === "body"); }
function firstAnimation(evidence) { return arr(evidence?.animations)[0] || null; }

function commonValues(evidence) {
  const desktop = firstViewport(evidence, "desktop");
  const tablet = firstViewport(evidence, "tablet");
  const mobile = firstViewport(evidence, "mobile");
  const desktopNodes = [...arr(desktop.scopes), ...arr(desktop.elements)];
  const body = desktopNodes.find(e => e.tag === "body") || desktop.scopes?.[0] || {};
  const nav = desktopNodes.find(e => e.tag === "nav" || e.role === "navigation") || {};
  const header = desktopNodes.find(e => e.tag === "header" || e.role === "banner") || {};
  const footer = desktopNodes.find(e => e.tag === "footer" || e.role === "contentinfo") || {};
  const interactions = arr(evidence?.interactions);
  const meaningfulState = interactions.find(row => Object.keys(row.hover || {}).length || Object.keys(row.focus || {}).length) || {};
  const animations = arr(evidence?.animations).filter(a => num(a?.timing?.duration) > 0);
  const durations = uniq(animations.map(a => num(a?.timing?.duration)).filter(v => v != null));
  const easings = uniq(animations.map(a => a?.timing?.easing).filter(Boolean));
  const stableDuration = animations.length >= 2 && durations.length === 1 ? durations[0] : null;
  const stableEasing = animations.length >= 2 && easings.length === 1 ? easings[0] : null;
  const fontFamilies = dominantStyle(evidence, "fontFamily", 8).map(x => x.value);
  const fontWeights = dominantStyle(evidence, "fontWeight", 10).map(x => x.value);
  const observedTouch = observedMinInteractive(evidence);
  const viewportVerified = arr(evidence?.viewports).length >= 3 && arr(evidence.viewports).every(v =>
    !v.targetViewport || (v.targetViewport.width === v.viewport?.width && v.targetViewport.height === v.viewport?.height)
  );
  const responsiveRules = [viewportRule(desktop), viewportRule(tablet), viewportRule(mobile)].filter(Boolean).join(" | ");
  const primaryLayout = [
    styleOf(body, "display") ? "display " + styleOf(body, "display") : null,
    styleOf(body, "flexDirection") && String(styleOf(body, "display")).includes("flex") ? "flex-direction " + styleOf(body, "flexDirection") : null,
    styleOf(body, "gridTemplateColumns") && styleOf(body, "gridTemplateColumns") !== "none" ? "grid " + styleOf(body, "gridTemplateColumns") : null,
  ].filter(Boolean).join("; ") || null;

  return {
    BACKGROUND_COLOR: styleOf(body, "backgroundColor"),
    SURFACE_COLOR: styleOf(body, "backgroundColor"),
    TEXT_PRIMARY: styleOf(body, "color"),
    PRIMARY_FONT: styleOf(body, "fontFamily") || fontFamilies[0],
    BASE_FONT_SIZE_PX: px(styleOf(body, "fontSize")),
    H1_SIZE_PX: px(styleOf(headingRep(evidence, 1), "fontSize")),
    H2_SIZE_PX: px(styleOf(headingRep(evidence, 2), "fontSize")),
    H3_SIZE_PX: px(styleOf(headingRep(evidence, 3), "fontSize")),
    H4_SIZE_PX: px(styleOf(headingRep(evidence, 4), "fontSize")),
    H5_SIZE_PX: px(styleOf(headingRep(evidence, 5), "fontSize")),
    H6_SIZE_PX: px(styleOf(headingRep(evidence, 6), "fontSize")),
    BODY_REGULAR_PX: px(styleOf(bodyRep(evidence), "fontSize") || styleOf(body, "fontSize")),
    FONT_WEIGHT_REGULAR: fontWeights.find(x => /400|normal/.test(x)) || fontWeights[0],
    FONT_WEIGHT_MEDIUM: fontWeights.find(x => /500/.test(x)),
    FONT_WEIGHT_SEMIBOLD: fontWeights.find(x => /600/.test(x)),
    FONT_WEIGHT_BOLD: fontWeights.find(x => /700|bold/.test(x)),
    BODY_LINE_HEIGHT: styleOf(body, "lineHeight"),
    LETTER_SPACING_PX: px(styleOf(body, "letterSpacing")),
    MAX_CONTENT_WIDTH_PX: px(desktop.scopes?.[0]?.rect?.width || desktop.document?.width),
    MIN_CONTENT_WIDTH_PX: px(mobile.scopes?.[0]?.rect?.width || mobile.viewport?.width),
    HEADER_HEIGHT_PX: px(rectOf(header, "height")),
    FOOTER_HEIGHT_PX: px(rectOf(footer, "height")),
    NAV_TYPE: nav.tag || nav.role || (nav.selector ? "navigation" : null),
    MIN_TOUCH_TARGET_PX: observedTouch == null ? null : px(observedTouch),
    DEFAULT_EASING: stableEasing,
    ANIMATION_NORMAL_MS: stableDuration,
    HOVER_FEEDBACK: Object.keys(meaningfulState.hover || {}).length ? JSON.stringify(meaningfulState.hover) : null,
    FOCUS_STATE: Object.keys(meaningfulState.focus || {}).length ? JSON.stringify(meaningfulState.focus) : null,
    CURSOR_INTERACTIVE: dominantStyle(evidence, "cursor", 6).map(x => x.value).find(v => v && v !== "auto"),
    DESKTOP_LAYOUT_RULES: viewportRule(desktop),
    TABLET_LAYOUT_RULES: viewportRule(tablet),
    MOBILE_LAYOUT_RULES: viewportRule(mobile),
    HEADER_DESKTOP: elementAtViewport(desktop, header?.selector),
    HEADER_TABLET: elementAtViewport(tablet, header?.selector),
    HEADER_MOBILE: elementAtViewport(mobile, header?.selector),
    ICON_LIBRARY: inferIconLibrary(evidence),
    SCROLL_BEHAVIOUR: evidence?.scroll?.behavior,
    HORIZONTAL_SCROLL_RULE: desktop.document?.horizontalOverflow ? "Horizontal overflow observed at desktop anchor" : "No horizontal overflow observed at desktop anchor",
    REDUCED_MOTION_RULES: evidence?.reducedMotion || null,
    LIGHT_THEME_SPEC: evidence?.themes?.light ? JSON.stringify(evidence.themes.light) : null,
    DARK_THEME_SPEC: evidence?.themes?.dark ? JSON.stringify(evidence.themes.dark) : null,
    PAGE_ROUTE: evidence?.url,
    PAGE_NAME: evidence?.title,
    REFERENCE_WIDTH_PX: px(desktop.viewport?.width),
    REFERENCE_HEIGHT_PX: px(desktop.viewport?.height),
    CONTENT_WIDTH_PX: px(desktop.scopes?.[0]?.rect?.width || desktop.document?.width),
    PAGE_PADDING_PX: px(styleOf(body, "paddingLeft")),
    PRIMARY_LAYOUT: primaryLayout,
    RESPONSIVE_BEHAVIOUR: responsiveRules,
    PAGE_INTERACTIONS: interactions.length ? interactions.length + " desktop hover/focus samples; " + (evidence?.coverage?.meaningfulInteractionCount ?? 0) + " produced observable style changes" : null,
    PAGE_ANIMATIONS: animations.length ? animations.length + " runtime Web Animations API records captured at desktop anchor" : null,
    PAGE_STATES: interactions.length ? "Hover/focus only; destructive/click/submit states intentionally not triggered" : null,
    PAGE_MOBILE_TRANSFORMATION: mobile.viewport ? "Verified at " + mobile.viewport.width + "×" + mobile.viewport.height + "; see Responsive Region Matrix" : null,
    TARGET_RESPONSIVE_COVERAGE_PERCENT: viewportVerified ? 100 : evidence?.coverage?.responsiveCoveragePercent,
    TARGET_COMPONENT_COVERAGE_PERCENT: evidence?.coverage?.componentCoveragePercent,
    TARGET_INTERACTION_COVERAGE_PERCENT: evidence?.coverage?.interactionCoveragePercent,
    TARGET_CONFIDENCE_PERCENT: evidence?.confidence,
    TARGET_VISUAL_MATCH_PERCENT: null,
    MAX_VISUAL_DEVIATION: "Not measured — this extractor records evidence confidence, not a pixel-similarity score",
    COMPONENT_NAMING: "Use semantic names derived from verified roles, labels, selectors, and the Responsive Region Matrix",
    DESIGN_TOKEN_STRUCTURE: "Create tokens only from repeated values listed under Observed Design Tokens; do not assign semantic brand meaning unless the reference exposes it",
    CSS_VARIABLE_STRUCTURE: "Map repeated VERIFIED values to CSS custom properties without inventing semantic roles",
    SHARED_COMPONENT_STRUCTURE: "Create shared components only for repeated VERIFIED structures",
    ASSET_NAMING_RULE: "Reference asset URLs are evidence only; preserve target-project ownership/licensing and naming",
    IMAGE_RESERVED_DIMENSIONS: "Use measured image dimensions/aspect ratios from DESIGN-EVIDENCE.json",
    CHROME_SUPPORT: "Verified in remote Chromium",
    ANDROID_CHROME_SUPPORT: "Responsive Chromium emulation captured; physical Android device not independently verified",
    MIN_VIEWPORT_WIDTH_PX: px(Math.min(...arr(evidence?.viewports).map(v => v.viewport?.width).filter(Boolean))),
    MAX_VIEWPORT_WIDTH_PX: px(Math.max(...arr(evidence?.viewports).map(v => v.viewport?.width).filter(Boolean))),
    SOURCE: "Rendered-browser evidence captured by Browserless + Playwright CDP",
    CONFIDENCE_PERCENT: evidence?.confidence,
    RESPONSIVE_DERIVATION: "Use exact captured viewport matrix plus source CSS media/container query conditions; do not infer semantic breakpoint names",
    REQUIRED_EVIDENCE: "See Verified Evidence Summary and optional DESIGN-EVIDENCE.json",
  };
}

function durationFromTransition(value) {
  if (!value) return null;
  const m = String(value).match(/([\d.]+)(ms|s)/);
  if (!m) return null;
  return m[2] === "s" ? Number(m[1]) * 1000 : Number(m[1]);
}
function compactStyle(el) {
  if (!el?.style) return null;
  const keys = ["color", "backgroundColor", "border", "borderRadius", "boxShadow", "fontSize", "fontWeight", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"];
  return keys.map(k => `${k}: ${el.style[k]}`).filter(x => !x.endsWith("undefined") && !x.endsWith("null")).join("; ");
}
function viewportRule(vp = {}) {
  if (!vp.viewport) return null;
  const visibleScopes = arr(vp.scopes).map(s => `${s.label || s.selector}: ${Math.round(s.rect?.width || 0)}×${Math.round(s.rect?.height || 0)} @ (${Math.round(s.rect?.x || 0)},${Math.round(s.rect?.y || 0)})`).join("; ");
  return `${vp.viewport.width}×${vp.viewport.height}; document ${vp.document?.width || "?"}×${vp.document?.height || "?"}; ${visibleScopes}`;
}
function elementAtViewport(vp = {}, selector) {
  if (!selector) return null;
  const e = [...arr(vp.scopes), ...arr(vp.elements)].find(x => x.selector === selector);
  if (!e) return null;
  return `${Math.round(e.rect?.width || 0)}×${Math.round(e.rect?.height || 0)} at (${Math.round(e.rect?.x || 0)},${Math.round(e.rect?.y || 0)}), display ${e.style?.display || "unknown"}, position ${e.style?.position || "unknown"}`;
}
function inferIconLibrary(evidence) {
  const texts = arr(evidence?.assets?.svgs).map(x => `${x.className || ""} ${x.href || ""}`).join(" ").toLowerCase();
  if (texts.includes("lucide")) return "Lucide";
  if (texts.includes("heroicon")) return "Heroicons";
  if (texts.includes("material")) return "Material Icons/Symbols";
  if (texts.includes("fontawesome") || texts.includes("fa-")) return "Font Awesome";
  return null;
}

function replaceUnknownUnits(markdown) {
  return markdown
    .replaceAll(UNKNOWN + "px", UNKNOWN)
    .replaceAll(UNKNOWN + "ms", UNKNOWN)
    .replaceAll(UNKNOWN + "%", UNKNOWN)
    .replaceAll(UNKNOWN + "KB", UNKNOWN)
    .replaceAll(UNKNOWN + "deg", UNKNOWN)
    .replaceAll(UNKNOWN + "ch", UNKNOWN);
}
function mdCell(value) {
  return String(value ?? UNKNOWN).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
function cleanLabel(value) {
  const v = String(value || "").replace(/\s+/g, " ").trim();
  if (!v || /requestAnimationFrame|function\s*\(/i.test(v)) return "";
  return v.slice(0, 80);
}
function compactStateDiff(diff) {
  const entries = Object.entries(diff || {});
  if (!entries.length) return "—";
  return entries.slice(0, 5).map(([key, value]) =>
    key + ": " + (value?.before ?? "?") + " → " + (value?.after ?? "?")
  ).join("; ");
}
function observedTokens(evidence) {
  const take = (key, limit = 10) => dominantStyle(evidence, key, limit).map(x => ({ value: x.value, count: x.count }));
  return {
    colors: take("color", 12),
    backgrounds: take("backgroundColor", 12).filter(x => !/rgba?\(0,\s*0,\s*0,\s*0\)/.test(x.value)),
    fonts: take("fontFamily", 8),
    fontSizes: take("fontSize", 12),
    fontWeights: take("fontWeight", 10),
    lineHeights: take("lineHeight", 10),
    radii: take("borderRadius", 10),
    gaps: take("gap", 10),
    shadows: take("boxShadow", 8),
  };
}
function compactRegionRows(evidence) {
  const desktop = firstViewport(evidence, "desktop");
  const tablet = firstViewport(evidence, "tablet");
  const mobile = firstViewport(evidence, "mobile");
  const usefulTags = new Set(["header","nav","main","aside","footer","section","form","dialog","button","input","textarea","select","img","video"]);
  const useful = e => e && (e.interactive || /^h[1-6]$/.test(e.tag || "") || usefulTags.has(e.tag) || ["fixed","sticky"].includes(e.style?.position));
  const rows = [];
  const seen = new Set();
  for (const e of [...arr(desktop.scopes), ...arr(desktop.elements)]) {
    if (!useful(e) || !e.selector || seen.has(e.selector)) continue;
    seen.add(e.selector);
    const find = vp => [...arr(vp.scopes), ...arr(vp.elements)].find(x => x.selector === e.selector);
    const format = x => x
      ? Math.round(x.rect?.width || 0) + "×" + Math.round(x.rect?.height || 0) + "; " + (x.style?.display || "?") + "; " + (x.style?.position || "?")
      : "not observed";
    rows.push({
      kind: classifyCandidate({ tag: e.tag, role: e.role, className: e.className, animation: e.style?.animationName && e.style.animationName !== "none" }),
      selector: e.selector,
      label: cleanLabel(e.label) || e.tag || e.selector,
      desktop: format(e),
      tablet: format(find(tablet)),
      mobile: format(find(mobile)),
    });
    if (rows.length >= 48) break;
  }
  return rows;
}
function evidenceSummary(evidence) {
  const lines = [];
  const bt = String.fromCharCode(96);
  const tokens = observedTokens(evidence);
  const regionRows = compactRegionRows(evidence);
  const meaningful = arr(evidence?.interactions).filter(row => Object.keys(row.hover || {}).length || Object.keys(row.focus || {}).length);

  lines.push("## Verified Evidence Summary", "");
  lines.push("> Machine rule: use only verified/derived evidence below or explicit values in this specification. Any " + bt + UNKNOWN + bt + " value must remain unresolved until new evidence is captured.", "");

  lines.push("### Capture provenance", "");
  lines.push("| Field | Value |", "|---|---|");
  lines.push("| Reference | " + bt + mdCell(evidence?.url) + bt + " |");
  lines.push("| Final URL | " + bt + mdCell(evidence?.finalUrl) + bt + " |");
  lines.push("| Page | " + mdCell(evidence?.title) + " |");
  lines.push("| Scope | " + mdCell(selectedLabel(evidence)) + " |");
  lines.push("| Captured | " + mdCell(evidence?.capturedAt) + " |");
  lines.push("| Browser | " + mdCell(evidence?.browser) + " |");
  lines.push("| Evidence confidence | " + mdCell(evidence?.confidence) + "% |");
  lines.push("| Component coverage | " + mdCell(evidence?.coverage?.componentCoverageClaim || UNKNOWN) + " |", "");

  lines.push("### Viewport verification", "");
  lines.push("| Mode | Requested | Browser-reported | Document | Horizontal overflow | Status |", "|---|---:|---:|---:|---|---|");
  for (const vp of arr(evidence?.viewports)) {
    const target = vp.targetViewport || vp.viewport || {};
    const actual = vp.viewport || {};
    const match = target.width === actual.width && target.height === actual.height;
    lines.push("| " + mdCell(vp.name) + " | " + target.width + "×" + target.height + " | " + actual.width + "×" + actual.height + " | " +
      (vp.document?.width ?? "?") + "×" + (vp.document?.height ?? "?") + " | " + (vp.document?.horizontalOverflow ? "yes" : "no") + " | " + (match ? "VERIFIED" : "MISMATCH") + " |");
  }
  lines.push("");

  lines.push("### Exact responsive CSS conditions", "");
  if (arr(evidence?.mediaQueries).length) {
    for (const q of arr(evidence.mediaQueries)) lines.push("- Media: " + bt + String(q).replace(/\x60/g, "\\x60") + bt);
  } else lines.push("- Media queries: " + bt + UNKNOWN + bt);
  if (arr(evidence?.containerQueries).length) {
    for (const q of arr(evidence.containerQueries)) lines.push("- Container: " + bt + String(q).replace(/\x60/g, "\\x60") + bt);
  } else lines.push("- Container queries: none directly observed/readable");
  lines.push("", "> Breakpoint names such as XS/SM/MD/LG are not inferred. Preserve source query conditions exactly.", "");

  lines.push("### Responsive region matrix", "");
  lines.push("| Kind | Region | Selector | Desktop | Tablet | Mobile |", "|---|---|---|---|---|---|");
  if (regionRows.length) {
    for (const r of regionRows) {
      lines.push("| " + mdCell(r.kind) + " | " + mdCell(r.label) + " | " + bt + mdCell(r.selector) + bt + " | " + mdCell(r.desktop) + " | " + mdCell(r.tablet) + " | " + mdCell(r.mobile) + " |");
    }
  } else lines.push("| — | No semantic region rows captured | — | — | — | — |");
  lines.push("");

  lines.push("### Observed design tokens", "");
  lines.push("> Frequency-ranked observed values only. They are not automatically assigned brand semantics.", "");
  for (const [name, values] of Object.entries(tokens)) {
    const rendered = values.length ? values.map(x => bt + x.value + bt + " ×" + x.count).join(", ") : UNKNOWN;
    lines.push("- **" + name + ":** " + rendered);
  }
  lines.push("");

  lines.push("### Interaction states", "");
  lines.push("- Captured desktop interaction samples: **" + arr(evidence?.interactions).length + "**");
  lines.push("- Samples with observable hover/focus changes: **" + meaningful.length + "**");
  if (evidence?.coverage?.interactionCoveragePercent != null) lines.push("- Sampling coverage of captured desktop interactive elements: **" + evidence.coverage.interactionCoveragePercent + "%**");
  if (meaningful.length) {
    lines.push("", "| Selector | Hover change | Focus change |", "|---|---|---|");
    for (const row of meaningful.slice(0, 24)) {
      lines.push("| " + bt + mdCell(row.selector) + bt + " | " + mdCell(compactStateDiff(row.hover)) + " | " + mdCell(compactStateDiff(row.focus)) + " |");
    }
  }
  lines.push("");

  lines.push("### Motion evidence", "");
  if (arr(evidence?.animations).length) {
    lines.push("| Selector | Duration | Easing | Iterations | Keyframes |", "|---|---:|---|---:|---:|");
    for (const a of arr(evidence.animations).slice(0, 30)) {
      lines.push("| " + bt + mdCell(a.selector || "unknown") + bt + " | " + mdCell(a.timing?.duration) + "ms | " + mdCell(a.timing?.easing) + " | " + mdCell(a.timing?.iterations) + " | " + arr(a.keyframes).length + " |");
    }
  } else lines.push("- No runtime Web Animations API records were observed in the selected scope.");
  lines.push("", "> A captured animation duration/easing is not promoted to a global design-system default unless repeated evidence proves consistency.", "");

  lines.push("### Assets and browser evidence", "");
  lines.push("- Fonts observed: **" + arr(evidence?.fonts).length + "**");
  lines.push("- SVGs observed: **" + arr(evidence?.assets?.svgs).length + "**");
  lines.push("- Images observed: **" + arr(evidence?.assets?.images).length + "**");
  lines.push("- Videos observed: **" + arr(evidence?.assets?.videos).length + "**");
  lines.push("- Canvas elements: **" + (evidence?.assets?.canvasCount ?? 0) + "**");
  lines.push("- Stylesheets readable/total: **" + (evidence?.styleSheets?.readable ?? "?") + "/" + (evidence?.styleSheets?.total ?? "?") + "**");
  lines.push("- Fixed/sticky elements observed: **" + arr(evidence?.scroll?.sticky).length + "**", "");

  lines.push("### Confidence and restrictions", "");
  for (const reason of arr(evidence?.confidenceReasons)) lines.push("- Confidence: " + reason);
  for (const item of arr(evidence?.restrictions)) lines.push("- Restriction: " + item);

  lines.push("", "### Machine implementation contract", "");
  lines.push("1. Trust viewport dimensions only when Viewport verification is VERIFIED.");
  lines.push("2. Use exact media/container query conditions; do not rename breakpoints by convention.");
  lines.push("3. Use observed design tokens as raw evidence; assign semantic token names only when the reference exposes that semantic meaning.");
  lines.push("4. Never convert evidence confidence into a visual-match score; visual similarity requires an independent screenshot-diff loop.");
  lines.push("5. " + bt + "DESIGN-EVIDENCE.json" + bt + " is the detailed evidence companion; " + bt + "DESIGN.md" + bt + " is the concise implementation contract.");
  return lines.join("\n");
}
function yaml(value) {
  return JSON.stringify(String(value ?? ""));
}

export function renderDesignMd({ template, evidence }) {
  if (!template || typeof template !== "string") throw new Error("DESIGN.md template is required.");
  if (!evidence?.url) throw new Error("Reference evidence is required.");
  const values = commonValues(evidence);
  let rendered = template.replace(/^#\s+DEISGN\.md\s*$/m, "# DESIGN.md");
  rendered = rendered.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
    const value = values[key];
    return value == null || value === "" || (typeof value === "number" && !Number.isFinite(value)) ? UNKNOWN : String(value);
  });
  rendered = replaceUnknownUnits(rendered);
  const withoutHeading = rendered.replace(/^#\s+DESIGN\.md\s*\n+/, "");
  const frontmatter = [
    "---",
    "schema: kk-reference-design-md/v2",
    "reference_url: " + yaml(evidence.url),
    "final_url: " + yaml(evidence.finalUrl),
    "page_title: " + yaml(evidence.title),
    "scope: " + yaml(selectedLabel(evidence)),
    "captured_at: " + yaml(evidence.capturedAt),
    "browser: " + yaml(evidence.browser),
    "evidence_confidence_percent: " + (Number(evidence.confidence) || 0),
    "measurement_policy: \"VERIFIED | DERIVED | UNKNOWN — DO NOT INVENT\"",
    "---",
  ].join("\n");
  return frontmatter + "\n\n# DESIGN.md\n\n" + evidenceSummary(evidence) + "\n\n---\n\n" + withoutHeading;
}


function evidenceNodeUseful(e) {
  if (!e) return false;
  const usefulTags = new Set(["body","header","nav","main","aside","footer","section","form","dialog","button","input","textarea","select","img","svg","video"]);
  return Boolean(
    e.interactive ||
    /^h[1-6]$/.test(e.tag || "") ||
    usefulTags.has(e.tag) ||
    ["fixed","sticky"].includes(e.style?.position) ||
    (e.style?.animationName && e.style.animationName !== "none")
  );
}

function slimEvidenceStyle(style = {}) {
  const keys = [
    "display","position","top","right","bottom","left","width","height","minWidth","maxWidth","minHeight","maxHeight",
    "marginTop","marginRight","marginBottom","marginLeft","paddingTop","paddingRight","paddingBottom","paddingLeft",
    "gap","rowGap","columnGap","gridTemplateColumns","gridTemplateRows","gridAutoFlow","justifyContent","alignItems",
    "flexDirection","flexWrap","color","backgroundColor","backgroundImage","opacity","border","borderRadius","boxShadow",
    "outline","outlineOffset","fontFamily","fontSize","fontWeight","fontStyle","lineHeight","letterSpacing","textAlign",
    "textTransform","whiteSpace","transform","transformOrigin","transitionProperty","transitionDuration",
    "transitionTimingFunction","animationName","animationDuration","animationTimingFunction","animationIterationCount",
    "overflow","overflowX","overflowY","scrollSnapType","scrollBehavior","zIndex","cursor","pointerEvents","filter",
    "backdropFilter","objectFit","objectPosition","aspectRatio"
  ];
  const out = {};
  for (const key of keys) {
    const value = style?.[key];
    if (value != null && value !== "") out[key] = value;
  }
  return out;
}

function slimEvidenceNode(node = {}) {
  return {
    selector: node.selector || null,
    tag: node.tag || null,
    role: node.role || null,
    className: node.className || "",
    label: cleanLabel(node.label) || node.tag || "",
    interactive: Boolean(node.interactive),
    rect: node.rect || null,
    style: slimEvidenceStyle(node.style),
    attrs: node.attrs || undefined,
    pseudoBefore: node.pseudoBefore || undefined,
    pseudoAfter: node.pseudoAfter || undefined,
  };
}

export function buildEvidenceCompanion(evidence) {
  const viewports = arr(evidence?.viewports).map(vp => {
    const semantic = arr(vp.elements).filter(evidenceNodeUseful).slice(0, 180);
    return {
      name: vp.name,
      targetViewport: vp.targetViewport || vp.viewport || null,
      viewport: vp.viewport || null,
      runtimeViewport: vp.runtimeViewport || null,
      document: vp.document || null,
      scopes: arr(vp.scopes).map(slimEvidenceNode),
      representativeElements: semantic.map(slimEvidenceNode),
      representativeElementPolicy: "Semantic, interactive, media, fixed/sticky, and animated elements; capped at 180 per viewport.",
    };
  });

  return {
    schema: "kk-reference-design-evidence-compact/v2",
    capture: {
      referenceUrl: evidence?.url || null,
      finalUrl: evidence?.finalUrl || null,
      title: evidence?.title || null,
      capturedAt: evidence?.capturedAt || null,
      browser: evidence?.browser || null,
      scope: evidence?.scope || null,
      selection: evidence?.selection || [],
    },
    coverage: evidence?.coverage || {},
    confidence: evidence?.confidence ?? null,
    confidenceReasons: arr(evidence?.confidenceReasons),
    viewports,
    responsiveCss: {
      mediaQueries: arr(evidence?.mediaQueries),
      containerQueries: arr(evidence?.containerQueries),
      stylesheetAccess: evidence?.styleSheets || null,
    },
    interactions: arr(evidence?.interactions).slice(0, 36),
    animations: arr(evidence?.animations).slice(0, 80),
    fonts: arr(evidence?.fonts).slice(0, 80),
    assets: {
      svgCount: arr(evidence?.assets?.svgs).length,
      imageCount: arr(evidence?.assets?.images).length,
      videoCount: arr(evidence?.assets?.videos).length,
      canvasCount: evidence?.assets?.canvasCount ?? 0,
      svgs: arr(evidence?.assets?.svgs).slice(0, 80),
      images: arr(evidence?.assets?.images).slice(0, 100),
      videos: arr(evidence?.assets?.videos).slice(0, 30),
    },
    scroll: evidence?.scroll || {},
    restrictions: arr(evidence?.restrictions),
    implementationPolicy: {
      unknown: UNKNOWN,
      breakpointRule: "Use exact media/container query conditions; do not infer semantic breakpoint names.",
      semanticTokenRule: "Observed values are evidence; semantic brand roles require reference evidence.",
      visualMatchRule: "Evidence confidence is not a screenshot-similarity score.",
    },
  };
}

export { UNKNOWN };
