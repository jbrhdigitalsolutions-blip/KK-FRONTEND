import dns from "node:dns/promises";
import net from "node:net";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { classifyCandidate, normalizeReferenceUrl, renderDesignMd } from "./design-md.mjs";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "mobile", width: 390, height: 844 },
];
const TEMPLATE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "DESIGN-TEMPLATE.md");

function env(name) { return String(process.env[name] || "").trim(); }
export function referenceDesignStatus() {
  return {
    ready: Boolean(env("BROWSERLESS_WS_ENDPOINT") || env("BROWSERLESS_TOKEN")),
    provider: "browserless",
    browser: "remote-chromium",
    viewports: VIEWPORTS,
    requires: ["BROWSERLESS_TOKEN or BROWSERLESS_WS_ENDPOINT"],
  };
}

function buildEndpoint() {
  const base = env("BROWSERLESS_WS_ENDPOINT") || "wss://production-sfo.browserless.io";
  const token = env("BROWSERLESS_TOKEN");
  if (!base && !token) throw new Error("Browserless is not configured.");
  let raw = base;
  if (raw.includes("{token}")) raw = raw.replaceAll("{token}", encodeURIComponent(token));
  const url = new URL(raw);
  if (token && !url.searchParams.has("token")) url.searchParams.set("token", token);
  if (!url.searchParams.has("timeout")) url.searchParams.set("timeout", "120000");
  return url.toString();
}

export function isPrivateOrRestrictedAddress(address) {
  if (!address) return true;
  if (net.isIP(address) === 4) {
    const p = address.split(".").map(Number);
    return p[0] === 0 || p[0] === 10 || p[0] === 127 ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 198 && (p[1] === 18 || p[1] === 19)) ||
      p[0] >= 224;
  }
  if (net.isIP(address) === 6) {
    const x = address.toLowerCase();
    if (x.startsWith("::ffff:")) return true;
    return x === "::1" || x === "::" ||
      x.startsWith("fc") || x.startsWith("fd") ||
      /^fe[89a-f]/.test(x) || x.startsWith("ff");
  }
  return false;
}

function restrictedHostname(host) {
  const h = String(host || "").toLowerCase().replace(/\.$/, "");
  return h === "localhost" || h === "localhost.localdomain" ||
    h.endsWith(".localhost") || h.endsWith(".local") ||
    h.endsWith(".internal") || h.endsWith(".lan") || h.endsWith(".home");
}

async function assertPublicReferenceUrl(input, dnsCache = null) {
  const normalized = normalizeReferenceUrl(input);
  const url = new URL(normalized);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (restrictedHostname(host)) throw new Error("Private/local reference URLs are not allowed in web-only mode.");
  if (net.isIP(host) && isPrivateOrRestrictedAddress(host)) throw new Error("Private/local reference URLs are not allowed in web-only mode.");
  if (env("KK_REFERENCE_ALLOW_PRIVATE").toLowerCase() === "true") return normalized;
  try {
    let answers = dnsCache?.get(host);
    if (!answers) {
      answers = await dns.lookup(host, { all: true, verbatim: true });
      if (dnsCache) dnsCache.set(host, answers);
    }
    if (!answers.length || answers.some(x => isPrivateOrRestrictedAddress(x.address))) {
      throw new Error("Reference URL resolves to a private or restricted network address.");
    }
  } catch (error) {
    if (/private|restricted/i.test(String(error?.message))) throw error;
    throw new Error(`Reference hostname could not be resolved safely: ${host}`);
  }
  return normalized;
}

async function installNetworkGuard(page) {
  if (env("KK_REFERENCE_ALLOW_PRIVATE").toLowerCase() === "true") return null;
  const session = await page.context().newCDPSession(page);
  const dnsCache = new Map();
  await session.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  session.on("Fetch.requestPaused", async event => {
    const requestId = event.requestId;
    try {
      const requestUrl = String(event.request?.url || "");
      const parsed = new URL(requestUrl);
      if (["data:", "blob:", "about:"].includes(parsed.protocol)) {
        await session.send("Fetch.continueRequest", { requestId }).catch(() => {});
        return;
      }
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Blocked non-web protocol");
      await assertPublicReferenceUrl(requestUrl, dnsCache);
      await session.send("Fetch.continueRequest", { requestId }).catch(() => {});
    } catch {
      await session.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }).catch(() => {});
    }
  });
  return session;
}

async function setExactViewport(page, viewport) {
  const width = Number(viewport?.width);
  const height = Number(viewport?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 240 || height < 240) {
    throw new Error("Invalid reference viewport requested.");
  }
  await page.setViewportSize({ width, height });
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Emulation.setDeviceMetricsOverride", {
      width, height, screenWidth: width, screenHeight: height,
      deviceScaleFactor: 1, mobile: false,
    });
  } finally {
    await session.detach().catch(() => {});
  }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const observed = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    visualWidth: window.visualViewport?.width ?? window.innerWidth,
    visualHeight: window.visualViewport?.height ?? window.innerHeight,
  }));
  if (Math.round(observed.width) !== width || Math.round(observed.height) !== height) {
    throw new Error(`Viewport verification failed: requested ${width}×${height}, browser reported ${observed.width}×${observed.height}.`);
  }
  return observed;
}

async function connectBrowser() {
  if (!referenceDesignStatus().ready) {
    const error = new Error("Reference → DESIGN.md cloud browser is not configured yet. Set BROWSERLESS_TOKEN (or BROWSERLESS_WS_ENDPOINT) on the server.");
    error.code = "BROWSERLESS_NOT_CONFIGURED";
    throw error;
  }
  return chromium.connectOverCDP(buildEndpoint(), { timeout: 30_000 });
}

async function pageForBrowser(browser) {
  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(12_000);
  page.setDefaultNavigationTimeout(45_000);
  await installNetworkGuard(page);
  return page;
}

async function gotoReference(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => {});
  await page.waitForTimeout(350);
  await assertPublicReferenceUrl(page.url());
}

const candidateScript = () => {
  function selectorFor(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return `#${CSS.escape(el.id)}`;
    for (const attr of ["data-testid", "data-test", "data-qa"]) {
      const v = el.getAttribute(attr);
      if (v) return `${el.tagName.toLowerCase()}[${attr}="${CSS.escape(v)}"]`;
    }
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter(x => x.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      const test = parts.join(" > ");
      try { if (document.querySelectorAll(test).length === 1) return test; } catch {}
      node = parent;
    }
    return parts.join(" > ");
  }
  function absoluteRect(el) {
    const r = el.getBoundingClientRect();
    return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
  }
  function labelFor(el) {
    const explicit = el.getAttribute("aria-label") || el.getAttribute("title") || el.querySelector?.("h1,h2,h3,h4,h5,h6")?.textContent || "";
    const clean = String(explicit).replace(/\s+/g, " ").trim();
    if (clean && !/requestAnimationFrame|function\s*\(/i.test(clean)) return clean.slice(0, 100);
    return el.tagName.toLowerCase();
  }
  const semantic = [...document.querySelectorAll([
    "header", "nav", "main", "aside", "footer", "section", "form", "dialog",
    "[role='banner']", "[role='navigation']", "[role='main']", "[role='complementary']", "[role='dialog']",
    "[class*='sidebar' i]", "[class*='workspace' i]", "[class*='dashboard' i]", "[class*='hero' i]",
    "[class*='header' i]", "[class*='footer' i]", "[class*='nav' i]", "[class*='modal' i]", "[class*='drawer' i]"
  ].join(","))];
  const animated = [...document.querySelectorAll("body *")].filter(el => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const hasAnimation = Boolean(s.animationName && s.animationName !== "none");
    const hasTransition = Boolean(s.transitionDuration && s.transitionDuration.split(",").some(v => parseFloat(v) > 0));
    const interactive = el.matches("a,button,input,select,textarea,summary,[role='button'],[role='link'],[role='tab'],[tabindex]");
    return hasAnimation || (hasTransition && (interactive || r.width * r.height >= 12000));
  }).slice(0, 80);
  const seen = new Set();
  const rows = [];
  for (const el of [...semantic, ...animated]) {
    const rect = absoluteRect(el);
    if (rect.width < 16 || rect.height < 12) continue;
    const selector = selectorFor(el);
    if (!selector || seen.has(selector)) continue;
    seen.add(selector);
    const s = getComputedStyle(el);
    rows.push({
      selector,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role"),
      className: typeof el.className === "string" ? el.className.slice(0, 220) : "",
      label: labelFor(el),
      rect,
      animation: (s.animationName && s.animationName !== "none") || (s.transitionDuration && s.transitionDuration.split(",").some(v => parseFloat(v) > 0)),
      interactive: el.matches("a,button,input,select,textarea,[role='button'],[role='link'],[tabindex]"),
    });
    if (rows.length >= 220) break;
  }
  return {
    title: document.title,
    finalUrl: location.href,
    document: { width: Math.max(document.documentElement.scrollWidth, innerWidth), height: Math.max(document.documentElement.scrollHeight, innerHeight) },
    rows,
  };
};

export async function inspectReferenceDesign({ url }) {
  const safeUrl = await assertPublicReferenceUrl(url);
  const browser = await connectBrowser();
  try {
    const page = await pageForBrowser(browser);
    await setExactViewport(page, VIEWPORTS[0]);
    await gotoReference(page, safeUrl);
    const info = await page.evaluate(candidateScript);
    const maxHeight = Math.min(Math.max(info.document.height, 900), 12_000);
    const shot = await page.screenshot({ type: "jpeg", quality: 58, clip: { x: 0, y: 0, width: 1440, height: maxHeight } });
    const candidates = info.rows.filter(x => x.rect.y < maxHeight).map((row, index) => ({
      id: `ref-${index + 1}`,
      ...row,
      kind: classifyCandidate(row),
    }));
    return {
      schema: "kk-reference-design-inspection/v1",
      url: safeUrl,
      finalUrl: info.finalUrl,
      title: info.title,
      screenshot: `data:image/jpeg;base64,${shot.toString("base64")}`,
      screenshotWidth: 1440,
      screenshotHeight: maxHeight,
      candidates,
      candidateCount: candidates.length,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

const snapshotScript = ({ selectors, maxElements }) => {
  function selectorFor(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return `#${CSS.escape(el.id)}`;
    for (const attr of ["data-testid", "data-test", "data-qa"]) {
      const v = el.getAttribute(attr);
      if (v) return `${el.tagName.toLowerCase()}[${attr}="${CSS.escape(v)}"]`;
    }
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter(x => x.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      const test = parts.join(" > ");
      try { if (document.querySelectorAll(test).length === 1) return test; } catch {}
      node = parent;
    }
    return parts.join(" > ");
  }
  function rect(el) {
    const r = el.getBoundingClientRect();
    return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height, viewportX: r.x, viewportY: r.y };
  }
  function compactCssValue(value) {
    const text = String(value ?? "");
    if (!text.includes("data:")) return text;
    return text.replace(/url\((["']?)data:[\s\S]*?\1\)/gi, "url(data:[inline-asset-omitted])");
  }
  function style(el) {
    const s = getComputedStyle(el);
    const keys = [
      "display","position","top","right","bottom","left","width","height","minWidth","maxWidth","minHeight","maxHeight",
      "marginTop","marginRight","marginBottom","marginLeft","paddingTop","paddingRight","paddingBottom","paddingLeft","gap","rowGap","columnGap",
      "gridTemplateColumns","gridTemplateRows","gridAutoFlow","justifyContent","alignItems","alignContent","placeItems","flexDirection","flexWrap","flexGrow","flexShrink","order",
      "color","backgroundColor","backgroundImage","opacity","border","borderTop","borderRight","borderBottom","borderLeft","borderRadius","boxShadow","outline","outlineOffset",
      "fontFamily","fontSize","fontWeight","fontStyle","lineHeight","letterSpacing","textAlign","textTransform","textDecorationLine","whiteSpace","wordBreak","textOverflow",
      "transform","transformOrigin","transitionProperty","transitionDuration","transitionTimingFunction","animationName","animationDuration","animationTimingFunction","animationIterationCount",
      "overflow","overflowX","overflowY","scrollSnapType","scrollBehavior","zIndex","cursor","pointerEvents","filter","backdropFilter","objectFit","objectPosition","aspectRatio"
    ];
    return Object.fromEntries(keys.map(k => [k, compactCssValue(s[k])]));
  }
  function pseudo(el, which) {
    const s = getComputedStyle(el, which);
    if (!s || !s.content || s.content === "none") return null;
    return { content: s.content, color: s.color, backgroundColor: s.backgroundColor, width: s.width, height: s.height, position: s.position, transform: s.transform };
  }
  function role(el) { return el.getAttribute("role") || null; }
  function label(el) {
    const explicit = el.getAttribute("aria-label") || el.getAttribute("title") || el.querySelector?.("h1,h2,h3,h4,h5,h6")?.textContent || "";
    const clean = String(explicit).replace(/\s+/g," ").trim();
    if (clean && !/requestAnimationFrame|function\s*\(/i.test(clean)) return clean.slice(0,180);
    return el.tagName.toLowerCase();
  }
  const roots = selectors.map(s => { try { return document.querySelector(s); } catch { return null; } }).filter(Boolean);
  const scopes = roots.map(el => ({ selector: selectorFor(el), tag: el.tagName.toLowerCase(), role: role(el), className: typeof el.className === "string" ? el.className.slice(0,220) : "", label: label(el), rect: rect(el), style: style(el), pseudoBefore: pseudo(el,"::before"), pseudoAfter: pseudo(el,"::after") }));
  const source = [];
  for (const root of roots) {
    source.push(root, ...root.querySelectorAll("*"));
    if (source.length >= maxElements * 2) break;
  }
  const seen = new Set();
  const elements = [];
  for (const el of source) {
    if (elements.length >= maxElements) break;
    const r = rect(el);
    if (r.width < 1 || r.height < 1) continue;
    const selector = selectorFor(el);
    if (!selector || seen.has(selector)) continue;
    seen.add(selector);
    const s = style(el);
    const interactive = el.matches("a,button,input,select,textarea,summary,[role='button'],[role='link'],[role='tab'],[role='menuitem'],[tabindex]");
    const semanticallyUseful = interactive || /^h[1-6]$/.test(el.tagName.toLowerCase()) || ["header","nav","main","aside","footer","section","form","dialog","img","svg","video","p"].includes(el.tagName.toLowerCase()) || s.position === "fixed" || s.position === "sticky" || s.animationName !== "none" || parseFloat(s.transitionDuration) > 0;
    if (!semanticallyUseful && elements.length > 220) continue;
    elements.push({ selector, tag: el.tagName.toLowerCase(), role: role(el), className: typeof el.className === "string" ? el.className.slice(0,220) : "", label: label(el), text: (el.textContent || "").replace(/\s+/g," ").trim().slice(0,320), interactive, rect: r, style: s, attrs: { href: el.getAttribute("href"), type: el.getAttribute("type"), ariaExpanded: el.getAttribute("aria-expanded"), ariaSelected: el.getAttribute("aria-selected"), ariaChecked: el.getAttribute("aria-checked"), ariaDisabled: el.getAttribute("aria-disabled") }, pseudoBefore: pseudo(el,"::before"), pseudoAfter: pseudo(el,"::after") });
  }
  return {
    runtimeViewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    document: {
      width: Math.max(document.documentElement.scrollWidth, innerWidth),
      height: Math.max(document.documentElement.scrollHeight, innerHeight),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1
    },
    scopes,
    elements,
  };
};

const pageEvidenceScript = ({ selectors }) => {
  function selectorFor(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts=[]; let node=el;
    while(node && node.nodeType===1 && parts.length<6){
      let part=node.tagName.toLowerCase(); const parent=node.parentElement;
      if(parent){ const same=[...parent.children].filter(x=>x.tagName===node.tagName); if(same.length>1)part+=`:nth-of-type(${same.indexOf(node)+1})`; }
      parts.unshift(part); const test=parts.join(" > ");
      try{if(document.querySelectorAll(test).length===1)return test;}catch{}
      node=parent;
    }
    return parts.join(" > ");
  }
  const media = new Set(), containers = new Set();
  const styleSheets = { total: document.styleSheets.length, readable: 0, blocked: 0 };
  function walkRules(rules) {
    for (const rule of rules || []) {
      try {
        if (rule.constructor?.name === "CSSMediaRule") media.add(rule.conditionText || rule.media?.mediaText || "");
        if (rule.constructor?.name === "CSSContainerRule") containers.add(rule.conditionText || "");
        if (rule.cssRules) walkRules(rule.cssRules);
      } catch {}
    }
  }
  for (const sheet of document.styleSheets) {
    try { walkRules(sheet.cssRules); styleSheets.readable += 1; }
    catch { styleSheets.blocked += 1; }
  }
  const roots = selectors.map(s => { try{return document.querySelector(s);}catch{return null;} }).filter(Boolean);
  const animations=[];
  for(const root of roots){
    for(const a of root.getAnimations?.({subtree:true}) || []){
      const target=a.effect?.target;
      let keyframes=[]; try{keyframes=a.effect?.getKeyframes?.()||[];}catch{}
      let timing={}; try{timing=a.effect?.getTiming?.()||{};}catch{}
      animations.push({selector:selectorFor(target),playState:a.playState,playbackRate:a.playbackRate,currentTime:a.currentTime,timing,keyframes:keyframes.slice(0,24)});
      if(animations.length>=80)break;
    }
    if(animations.length>=80)break;
  }
  const fonts=[];
  try { for(const f of document.fonts || []) fonts.push({family:f.family,style:f.style,weight:f.weight,stretch:f.stretch,status:f.status}); } catch {}
  const svgs=[...document.querySelectorAll("svg")].slice(0,120).map(el=>({selector:selectorFor(el),className:typeof el.className?.baseVal==="string"?el.className.baseVal:"",viewBox:el.getAttribute("viewBox"),width:el.getAttribute("width"),height:el.getAttribute("height"),fill:el.getAttribute("fill"),stroke:el.getAttribute("stroke")}));
  function assetUrl(value) {
    const v=String(value||"");
    return v.startsWith("data:") ? "data:[inline-asset-omitted]" : v;
  }
  const images=[...document.images].slice(0,160).map(el=>({selector:selectorFor(el),src:assetUrl(el.currentSrc||el.src),alt:el.alt,naturalWidth:el.naturalWidth,naturalHeight:el.naturalHeight,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,loading:el.loading}));
  const videos=[...document.querySelectorAll("video")].slice(0,60).map(el=>({selector:selectorFor(el),src:assetUrl(el.currentSrc||el.src),poster:assetUrl(el.poster),autoplay:el.autoplay,loop:el.loop,muted:el.muted,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}));
  const sticky=[...document.querySelectorAll("body *")].filter(el=>["fixed","sticky"].includes(getComputedStyle(el).position)).slice(0,100).map(el=>({selector:selectorFor(el),position:getComputedStyle(el).position,top:getComputedStyle(el).top,bottom:getComputedStyle(el).bottom}));
  return {
    mediaQueries:[...media].filter(Boolean),
    containerQueries:[...containers].filter(Boolean),
    animations,
    fonts,
    styleSheets,
    assets:{svgs,images,videos,canvasCount:document.querySelectorAll("canvas").length},
    scroll:{behavior:getComputedStyle(document.documentElement).scrollBehavior,sticky}
  };
};

async function stateStyle(locator) {
  return locator.evaluate(el => {
    const s=getComputedStyle(el);
    const keys=["color","backgroundColor","border","borderColor","boxShadow","outline","outlineOffset","opacity","transform","filter","textDecorationLine","cursor"];
    return Object.fromEntries(keys.map(k=>[k,s[k]]));
  });
}
function diffState(before, after) {
  const out={};
  for(const key of new Set([...Object.keys(before||{}),...Object.keys(after||{})])) if(before?.[key]!==after?.[key]) out[key]={before:before?.[key],after:after?.[key]};
  return out;
}
async function collectInteractions(page, selectors) {
  const targets = await page.evaluate(({selectors}) => {
    function selectorFor(el){
      if(el.id)return `#${CSS.escape(el.id)}`;
      const parts=[];let n=el;while(n&&n.nodeType===1&&parts.length<6){let p=n.tagName.toLowerCase(),par=n.parentElement;if(par){const same=[...par.children].filter(x=>x.tagName===n.tagName);if(same.length>1)p+=`:nth-of-type(${same.indexOf(n)+1})`;}parts.unshift(p);const q=parts.join(" > ");try{if(document.querySelectorAll(q).length===1)return q;}catch{}n=par;}return parts.join(" > ");
    }
    const out=[];
    const interactiveSelector="a,button,input,select,textarea,summary,[role='button'],[role='link'],[role='tab'],[tabindex]";
    for(const s of selectors){
      let root;try{root=document.querySelector(s);}catch{}
      if(!root)continue;
      const candidates=[];
      if(root.matches?.(interactiveSelector))candidates.push(root);
      candidates.push(...root.querySelectorAll(interactiveSelector));
      for(const el of candidates){const q=selectorFor(el);if(q&&!out.includes(q))out.push(q);if(out.length>=36)break;}
      if(out.length>=36)break;
    }
    return out;
  }, {selectors});
  const rows=[];
  for(const selector of targets){
    const loc=page.locator(selector).first();
    try{
      if(!await loc.isVisible({timeout:600}))continue;
      const before=await stateStyle(loc);
      let hover=null,focus=null;
      try{await loc.hover({timeout:1000});hover=diffState(before,await stateStyle(loc));}catch{}
      try{await loc.focus({timeout:1000});focus=diffState(before,await stateStyle(loc));await page.evaluate(()=>document.activeElement?.blur?.());}catch{}
      rows.push({selector,before,hover,focus});
    }catch{}
  }
  return rows;
}

function normalizeSelection(scope, selectors) {
  if (scope === "whole") return { scope: "whole", selectors: ["body"], selection: [{ label: "Whole Page", selector: "body", kind: "Page" }] };
  const clean = [...new Set((selectors || []).map(String).map(x => x.trim()).filter(Boolean))].slice(0, 20);
  if (!clean.length) throw new Error("Select at least one reference section or element.");
  return { scope: "selected", selectors: clean, selection: clean.map(selector => ({ selector, label: selector, kind: "Selected" })) };
}

export async function generateReferenceDesignMd({ url, scope = "whole", selectors = [] }) {
  const safeUrl = await assertPublicReferenceUrl(url);
  const chosen = normalizeSelection(scope, selectors);
  const browser = await connectBrowser();
  try {
    const page = await pageForBrowser(browser);
    const responsive = [];
    let title = "";
    let finalUrl = safeUrl;
    let pageEvidence = null;

    for (const viewport of VIEWPORTS) {
      const observedViewport = await setExactViewport(page, viewport);
      await gotoReference(page, safeUrl);
      if (viewport.name === "desktop") {
        title = await page.title();
        finalUrl = page.url();
        pageEvidence = await page.evaluate(pageEvidenceScript, { selectors: chosen.selectors });
      }
      const shot = await page.evaluate(snapshotScript, { selectors: chosen.selectors, maxElements: chosen.scope === "whole" ? 520 : 360 });
      responsive.push({
        name: viewport.name,
        targetViewport: { width: viewport.width, height: viewport.height },
        viewport: { width: observedViewport.width, height: observedViewport.height, devicePixelRatio: observedViewport.devicePixelRatio },
        ...shot,
      });
    }

    await setExactViewport(page, VIEWPORTS[0]);
    await gotoReference(page, safeUrl);
    const interactions = await collectInteractions(page, chosen.selectors);
    const desktopInteractive = responsive[0]?.elements?.filter(e => e.interactive).length || 0;
    const interactionCoveragePercent = desktopInteractive
      ? Math.min(100, Math.round((interactions.length / desktopInteractive) * 100))
      : null;
    const meaningfulInteractionCount = interactions.filter(row =>
      Object.keys(row.hover || {}).length || Object.keys(row.focus || {}).length
    ).length;
    const componentCount = new Set(responsive.flatMap(v => v.elements.map(e => e.selector))).size;
    const viewportVerified = responsive.every(v =>
      v.targetViewport?.width === v.viewport?.width && v.targetViewport?.height === v.viewport?.height
    );
    const crossOriginCssBlocked = Number(pageEvidence?.styleSheets?.blocked || 0);
    const canvasCount = Number(pageEvidence?.assets?.canvasCount || 0);
    let confidence = 97;
    const confidenceReasons = [];
    if (!viewportVerified) { confidence -= 30; confidenceReasons.push("One or more requested viewports did not match browser-reported dimensions."); }
    else confidenceReasons.push("All three requested viewports were browser-verified exactly.");
    if (crossOriginCssBlocked > 0) { confidence -= 4; confidenceReasons.push(`${crossOriginCssBlocked} stylesheet(s) were not directly readable; rendered computed styles were still measured.`); }
    if (canvasCount > 0) { confidence -= 4; confidenceReasons.push(`${canvasCount} canvas element(s) cannot be reconstructed from DOM/CSS evidence alone.`); }
    if (interactionCoveragePercent != null && interactionCoveragePercent < 80) {
      confidence -= Math.min(10, Math.ceil((80 - interactionCoveragePercent) / 8));
      confidenceReasons.push(`Interactive-state sampling covered ${interactionCoveragePercent}% of captured desktop interactive elements.`);
    }
    confidence = Math.max(50, Math.min(97, confidence));

    const restrictions = [
      "Only states safely observable without submitting forms, clicking destructive actions, bypassing authentication, or defeating bot/CAPTCHA protections are measured.",
      "Chromium rendering is verified; Safari/WebKit and Firefox rasterization are not independently verified by this capture.",
      "Cross-origin stylesheet rules that the browser does not expose remain unverified; computed rendered styles are still captured where visible.",
      "Canvas/WebGL internal drawing instructions cannot be reconstructed from DOM/CSS evidence alone.",
      "Navigation and subresource requests are blocked when they target localhost, private, link-local, carrier-grade NAT, benchmark, multicast, or otherwise restricted network addresses.",
    ];
    const evidence = {
      schema: "kk-reference-design-evidence/v2",
      url: safeUrl,
      finalUrl,
      title,
      capturedAt: new Date().toISOString(),
      browser: "Remote Chromium via Browserless + Playwright CDP",
      scope: chosen.scope,
      selection: chosen.selection,
      viewports: responsive,
      interactions,
      ...pageEvidence,
      coverage: {
        componentCount,
        componentCoveragePercent: null,
        componentCoverageClaim: "NOT CLAIMED — capture is representative, not an exhaustive DOM census",
        interactionSamples: interactions.length,
        meaningfulInteractionCount,
        interactionCoveragePercent,
        responsiveCoveragePercent: viewportVerified ? 100 : null,
      },
      confidence,
      confidenceReasons,
      restrictions,
    };
    const template = await fs.readFile(TEMPLATE_FILE, "utf8");
    const markdown = renderDesignMd({ template, evidence });
    return {
      schema: "kk-reference-design-md/v2",
      filename: "DESIGN.md",
      markdown,
      evidenceFilename: "DESIGN-EVIDENCE.json",
      evidenceJson: JSON.stringify(evidence, null, 2),
      summary: {
        url: safeUrl,
        finalUrl,
        title,
        scope: chosen.scope,
        selectedCount: chosen.selectors.length,
        viewports: responsive.map(v => `${v.name}:${v.viewport.width}x${v.viewport.height}`),
        viewportVerified,
        componentCount,
        interactionSamples: interactions.length,
        meaningfulInteractionCount,
        interactionCoveragePercent,
        animationCount: pageEvidence?.animations?.length || 0,
        mediaQueryCount: pageEvidence?.mediaQueries?.length || 0,
        confidence,
        confidenceReasons,
      },
    };
  } finally {
    await browser.close().catch(() => {});
  }
}
