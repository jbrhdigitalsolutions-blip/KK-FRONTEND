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

export function classifyCandidate({ tag = "", role = "", className = "", animation = false } = {}) {
  const t = String(tag).toLowerCase();
  const r = String(role).toLowerCase();
  const c = String(className).toLowerCase();
  if (animation) return "Animation";
  if (t === "header" || r === "banner" || /(^|[-_ ])header/.test(c)) return "Header";
  if (t === "footer" || r === "contentinfo" || /(^|[-_ ])footer/.test(c)) return "Footer";
  if (t === "nav" || r === "navigation" || /(^|[-_ ])nav/.test(c)) return "Navigation";
  if (t === "aside" || r === "complementary" || /sidebar|side-nav|sidenav/.test(c)) return "Sidebar";
  if (t === "main" || r === "main" || /workspace|dashboard|canvas|editor/.test(c)) return "Workspace";
  if (t === "section" || /hero|section|feature|pricing|testimonial|gallery/.test(c)) return "Section";
  if (t === "form" || r === "form") return "Form";
  if (t === "dialog" || r === "dialog" || /modal|drawer|sheet|popover/.test(c)) return "Overlay";
  return "Component";
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
  const body = representativeBy(evidence, e => e.tag === "body") || desktop.scopes?.[0] || {};
  const button = buttonRep(evidence) || {};
  const input = inputRep(evidence) || {};
  const card = cardRep(evidence) || {};
  const nav = navRep(evidence) || {};
  const side = sidebarRep(evidence) || {};
  const header = headerRep(evidence) || {};
  const footer = footerRep(evidence) || {};
  const hero = heroRep(evidence) || {};
  const anim = firstAnimation(evidence) || {};
  const breakpoints = mediaBreakpoints(evidence?.mediaQueries);
  const colors = dominantStyle(evidence, "color", 16).map(x => x.value);
  const backgrounds = dominantStyle(evidence, "backgroundColor", 16).map(x => x.value).filter(v => !/rgba?\(0,\s*0,\s*0,\s*0\)/.test(v));
  const fontFamilies = dominantStyle(evidence, "fontFamily", 8).map(x => x.value);
  const fontSizes = dominantStyle(evidence, "fontSize", 16).map(x => x.value);
  const fontWeights = dominantStyle(evidence, "fontWeight", 10).map(x => x.value);
  const radii = dominantStyle(evidence, "borderRadius", 12).map(x => x.value);
  const shadows = dominantStyle(evidence, "boxShadow", 10).map(x => x.value);
  const gaps = dominantStyle(evidence, "gap", 12).map(x => x.value);
  const state = arr(evidence?.interactions)[0] || {};
  const observedTouch = observedMinInteractive(evidence);

  const m = {
    BACKGROUND_COLOR: styleOf(body, "backgroundColor") || backgrounds[0],
    SURFACE_COLOR: backgrounds[1] || backgrounds[0],
    ELEVATED_SURFACE_COLOR: backgrounds[2] || backgrounds[1],
    TEXT_PRIMARY: styleOf(body, "color") || colors[0],
    TEXT_SECONDARY: colors[1],
    TEXT_MUTED: colors[2],
    BRAND_COLORS: colors.slice(0, 8).join(", "),
    PRIMARY_FONT: styleOf(body, "fontFamily") || fontFamilies[0],
    SECONDARY_FONT: fontFamilies[1],
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
    MAX_CONTENT_WIDTH_PX: px(desktop.document?.width || desktop.viewport?.width),
    MIN_CONTENT_WIDTH_PX: px(mobile.viewport?.width),
    HEADER_HEIGHT_PX: px(rectOf(header, "height")),
    FOOTER_HEIGHT_PX: px(rectOf(footer, "height")),
    SIDEBAR_EXPANDED_PX: px(rectOf(side, "width")),
    HERO_MIN_HEIGHT_PX: px(rectOf(hero, "height")),
    HERO_MAX_WIDTH_PX: px(rectOf(hero, "width")),
    BUTTON_MD_HEIGHT_PX: px(rectOf(button, "height")),
    BUTTON_RADIUS_PX: px(styleOf(button, "borderRadius")),
    BUTTON_TRANSITION_MS: durationFromTransition(styleOf(button, "transitionDuration")),
    BUTTON_PRIMARY_STYLE: compactStyle(button),
    INPUT_HEIGHT_PX: px(rectOf(input, "height")),
    INPUT_RADIUS_PX: px(styleOf(input, "borderRadius")),
    CARD_RADIUS_PX: px(styleOf(card, "borderRadius")),
    CARD_SHADOW: styleOf(card, "boxShadow"),
    NAV_TYPE: nav.tag || nav.role || (nav.selector ? "navigation" : null),
    NAV_HOVER_STATE: state.hover ? JSON.stringify(state.hover) : null,
    FOCUS_INDICATOR: state.focus ? JSON.stringify(state.focus) : null,
    MIN_TOUCH_TARGET_PX: observedTouch == null ? null : px(observedTouch),
    DEFAULT_EASING: anim.timing?.easing,
    ANIMATION_NORMAL_MS: anim.timing?.duration,
    HOVER_FEEDBACK: state.hover ? JSON.stringify(state.hover) : null,
    FOCUS_STATE: state.focus ? JSON.stringify(state.focus) : null,
    CURSOR_INTERACTIVE: dominantStyle(evidence, "cursor", 3).map(x => x.value).find(v => v !== "auto") || "pointer",
    BREAKPOINT_XS_PX: breakpoints[0],
    BREAKPOINT_SM_PX: breakpoints[1],
    BREAKPOINT_MD_PX: breakpoints[2],
    BREAKPOINT_LG_PX: breakpoints[3],
    BREAKPOINT_XL_PX: breakpoints[4],
    BREAKPOINT_XXL_PX: breakpoints[5],
    DESKTOP_LAYOUT_RULES: viewportRule(desktop),
    TABLET_LAYOUT_RULES: viewportRule(tablet),
    MOBILE_LAYOUT_RULES: viewportRule(mobile),
    HEADER_DESKTOP: elementAtViewport(desktop, header?.selector),
    HEADER_TABLET: elementAtViewport(tablet, header?.selector),
    HEADER_MOBILE: elementAtViewport(mobile, header?.selector),
    SIDEBAR_DESKTOP: elementAtViewport(desktop, side?.selector),
    SIDEBAR_TABLET: elementAtViewport(tablet, side?.selector),
    SIDEBAR_MOBILE: elementAtViewport(mobile, side?.selector),
    HERO_DESKTOP: elementAtViewport(desktop, hero?.selector),
    HERO_TABLET: elementAtViewport(tablet, hero?.selector),
    HERO_MOBILE: elementAtViewport(mobile, hero?.selector),
    ICON_LIBRARY: inferIconLibrary(evidence),
    IMAGE_OBJECT_FIT: dominantValue(evidence, "objectFit"),
    SCROLL_BEHAVIOUR: evidence?.scroll?.behavior,
    HORIZONTAL_SCROLL_RULE: desktop.document?.horizontalOverflow ? "Horizontal overflow observed" : "No horizontal overflow observed at captured desktop anchor",
    REDUCED_MOTION_RULES: evidence?.reducedMotion || null,
    LIGHT_THEME_SPEC: evidence?.themes?.light ? JSON.stringify(evidence.themes.light) : null,
    DARK_THEME_SPEC: evidence?.themes?.dark ? JSON.stringify(evidence.themes.dark) : null,
    PAGE_ROUTE: evidence?.url,
    PAGE_NAME: evidence?.title,
    PAGE_PADDING_PX: px(styleOf(body, "paddingLeft")),
    SECTION_COUNT: allElements(evidence).filter(e => e.tag === "section").length,
    PAGE_INTERACTIONS: arr(evidence?.interactions).length ? `${arr(evidence.interactions).length} measured hover/focus interaction samples` : null,
    PAGE_ANIMATIONS: arr(evidence?.animations).length ? `${arr(evidence.animations).length} runtime animations captured` : null,
    TARGET_RESPONSIVE_COVERAGE_PERCENT: arr(evidence?.viewports).length >= 3 ? 100 : null,
    TARGET_COMPONENT_COVERAGE_PERCENT: evidence?.coverage?.componentCoveragePercent,
    TARGET_INTERACTION_COVERAGE_PERCENT: evidence?.coverage?.interactionCoveragePercent,
    TARGET_CONFIDENCE_PERCENT: evidence?.confidence,
    TARGET_VISUAL_MATCH_PERCENT: evidence?.confidence,
    MAX_VISUAL_DEVIATION: evidence?.confidence ? `Evidence confidence ${evidence.confidence}%; unverified values remain UNKNOWN` : null,
    COMPONENT_NAMING: "Use semantic names derived from verified roles/labels/selectors in the evidence appendix",
    DESIGN_TOKEN_STRUCTURE: "Generate tokens only from repeated VERIFIED colors, typography, spacing, radius, border and shadow values in the evidence appendix",
    CSS_VARIABLE_STRUCTURE: "Map repeated VERIFIED values to CSS custom properties; do not create semantic meanings that were not observed",
    SHARED_COMPONENT_STRUCTURE: "Create shared components for repeated VERIFIED structures only",
    ASSET_NAMING_RULE: "Preserve project-owned asset naming; reference asset URLs are evidence only unless reuse is authorized",
    IMAGE_RESERVED_DIMENSIONS: "Use captured width/height/aspect-ratio values from the evidence appendix",
    MAX_LAYOUT_SHIFT: UNKNOWN,
    CHROME_SUPPORT: "Captured with remote Chromium",
    EDGE_SUPPORT: "Chromium-compatible behavior expected; not independently verified",
    SAFARI_SUPPORT: UNKNOWN,
    FIREFOX_SUPPORT: UNKNOWN,
    IOS_SAFARI_SUPPORT: UNKNOWN,
    ANDROID_CHROME_SUPPORT: "Responsive Chromium evidence captured; physical Android device not independently verified",
    MIN_VIEWPORT_WIDTH_PX: px(Math.min(...arr(evidence?.viewports).map(v => v.viewport?.width).filter(Boolean))),
    MAX_TESTED_WIDTH_PX: px(Math.max(...arr(evidence?.viewports).map(v => v.viewport?.width).filter(Boolean))),
    HIGH_DPI_RULES: UNKNOWN,
    ORIENTATION_RULES: UNKNOWN,
  };

  if (radii[0]) m.RADIUS_MD_PX = px(radii[0]);
  if (shadows[0]) m.SHADOW_MEDIUM = shadows[0];
  if (gaps[0]) m.COMPONENT_GAP_PX = px(gaps[0]);
  if (fontSizes[0]) m.BODY_LARGE_PX = px(fontSizes[0]);
  return m;
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
    .replaceAll(`${UNKNOWN}px`, UNKNOWN)
    .replaceAll(`${UNKNOWN}ms`, UNKNOWN)
    .replaceAll(`${UNKNOWN}%`, UNKNOWN)
    .replaceAll(`${UNKNOWN}KB`, UNKNOWN)
    .replaceAll(`${UNKNOWN}deg`, UNKNOWN)
    .replaceAll(`${UNKNOWN}ch`, UNKNOWN);
}
function json(v) { return JSON.stringify(v, null, 2); }
function evidenceAppendix(evidence) {
  const lines = [];
  lines.push("# Verified Reference Evidence", "");
  lines.push("> This appendix is generated from rendered browser evidence. `VERIFIED` means directly observed. `DERIVED` means calculated from observed values. `UNKNOWN — DO NOT INVENT` means the reference did not expose enough evidence.", "");
  lines.push("## Capture", "");
  lines.push(`- Reference URL: \`${text(evidence?.url)}\``);
  lines.push(`- Final URL after navigation: \`${text(evidence?.finalUrl)}\``);
  lines.push(`- Page title: ${text(evidence?.title)}`);
  lines.push(`- Selected scope: **${selectedLabel(evidence)}**`);
  lines.push(`- Captured at: ${text(evidence?.capturedAt)}`);
  lines.push(`- Browser: ${text(evidence?.browser)}`);
  lines.push(`- Evidence confidence: ${text(evidence?.confidence)}%`, "");
  lines.push("## Selected Scope Locators", "", "```json", json(evidence?.selection || [{ label: "Whole Page", selector: "body" }]), "```", "");
  lines.push("## Responsive Measurements", "");
  for (const vp of arr(evidence?.viewports)) {
    lines.push(`### ${vp.name} — ${vp.viewport?.width}×${vp.viewport?.height}`, "", "```json", json({
      document: vp.document,
      scopes: vp.scopes,
      representativeElements: vp.elements,
    }), "```", "");
  }
  lines.push("## Interaction State Measurements", "", "```json", json(evidence?.interactions || []), "```", "");
  lines.push("## Animation / Transition Evidence", "", "```json", json(evidence?.animations || []), "```", "");
  lines.push("## Responsive CSS Evidence", "", "```json", json({ mediaQueries: evidence?.mediaQueries || [], containerQueries: evidence?.containerQueries || [] }), "```", "");
  lines.push("## Font Evidence", "", "```json", json(evidence?.fonts || []), "```", "");
  lines.push("## Asset / SVG / Media Evidence", "", "```json", json(evidence?.assets || {}), "```", "");
  lines.push("## Scroll / Sticky Evidence", "", "```json", json(evidence?.scroll || {}), "```", "");
  lines.push("## Known Restrictions", "");
  for (const item of arr(evidence?.restrictions)) lines.push(`- ${item}`);
  if (!arr(evidence?.restrictions).length) lines.push("- No extractor restriction was reported for the captured scope.");
  return lines.join("\n");
}

export function renderDesignMd({ template, evidence }) {
  if (!template || typeof template !== "string") throw new Error("DESIGN.md template is required.");
  if (!evidence?.url) throw new Error("Reference evidence is required.");
  const values = commonValues(evidence);
  let rendered = template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
    const value = values[key];
    return value == null || value === "" || (typeof value === "number" && !Number.isFinite(value)) ? UNKNOWN : String(value);
  });
  rendered = replaceUnknownUnits(rendered);
  return `${evidenceAppendix(evidence)}\n\n---\n\n${rendered}`;
}

export { UNKNOWN };
