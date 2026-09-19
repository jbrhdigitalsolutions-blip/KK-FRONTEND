import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { ensureDir, writeJson, writeText, safeSlug, sha256Buffer } from "../fs-utils.mjs";
import { compilePattern, canonicalizeRoute, designTemplateForRoute, routeMatchesScope } from "./route-utils.mjs";
import { classifyDesignAsset } from "./asset-utils.mjs";

const SAFE_DENY = /(?:^|\/)(?:logout|log-out|signout|sign-out|delete-account|remove-account|unsubscribe|disconnect-account|oauth\/callback|auth\/callback)(?:\/|$)/i;
const STATIC_EXT = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|map|woff2?|ttf|otf|eot|mp3|wav|ogg|m4a|flac|mp4|webm|mov|m3u8|pdf|zip|xml)(?:$|\?)/i;
const TRACKING = /^(?:utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|ref_src)$/i;

const DEFAULT_VIEWPORTS = [
  ["phone-320x568", 320, 568],
  ["phone-360x800", 360, 800],
  ["phone-375x812", 375, 812],
  ["phone-390x844", 390, 844],
  ["phone-412x915", 412, 915],
  ["phone-430x932", 430, 932],
  ["phone-landscape-844x390", 844, 390],
  ["tablet-600x960", 600, 960],
  ["tablet-768x1024", 768, 1024],
  ["tablet-820x1180", 820, 1180],
  ["tablet-landscape-1024x768", 1024, 768],
  ["laptop-1280x720", 1280, 720],
  ["desktop-1366x768", 1366, 768],
  ["desktop-1440x900", 1440, 900],
  ["desktop-1536x864", 1536, 864],
  ["desktop-1920x1080", 1920, 1080],
  ["desktop-2560x1440", 2560, 1440],
  ["ultrawide-3440x1440", 3440, 1440],
].map(([name, width, height]) => ({ name, width, height, source: "representative" }));

const STYLE_PROPS = [
  "display","visibility","opacity","position","z-index","overflow","overflow-x","overflow-y",
  "box-sizing","width","height","min-width","min-height","max-width","max-height",
  "top","right","bottom","left","inset",
  "margin-top","margin-right","margin-bottom","margin-left",
  "padding-top","padding-right","padding-bottom","padding-left",
  "gap","row-gap","column-gap",
  "flex","flex-basis","flex-grow","flex-shrink","flex-direction","flex-wrap",
  "justify-content","align-items","align-content","align-self","order",
  "grid-template-columns","grid-template-rows","grid-auto-flow","grid-column","grid-row",
  "font-family","font-size","font-weight","font-style","line-height","letter-spacing","word-spacing",
  "text-align","text-transform","text-decoration-line","white-space","word-break","text-overflow",
  "color","background-color","background-image",
  "border-top-width","border-right-width","border-bottom-width","border-left-width",
  "border-top-color","border-right-color","border-bottom-color","border-left-color",
  "border-top-left-radius","border-top-right-radius","border-bottom-right-radius","border-bottom-left-radius",
  "outline-color","outline-width","outline-style",
  "box-shadow","filter","backdrop-filter","transform","transform-origin","clip-path",
  "transition-property","transition-duration","transition-delay","transition-timing-function",
  "animation-name","animation-duration","animation-delay","animation-timing-function",
  "animation-iteration-count","animation-direction","animation-fill-mode","animation-play-state",
  "cursor","pointer-events","user-select","touch-action",
  "scroll-behavior","scroll-snap-type","scroll-snap-align","overscroll-behavior",
  "object-fit","object-position","aspect-ratio",
];

function normalizeRoute(raw, base, origin) {
  try {
    const u = new URL(raw, base);
    if (!/^https?:$/.test(u.protocol) || u.origin !== origin) return null;
    u.hash = "";
    if (SAFE_DENY.test(u.pathname) || STATIC_EXT.test(u.pathname)) return null;
    [...u.searchParams.keys()].forEach((k) => {
      if (TRACKING.test(k) || ["page","offset","cursor"].includes(k)) u.searchParams.delete(k);
    });
    return u.href;
  } catch {
    return null;
  }
}

function uniqueViewports(base, breakpoints, max = 72) {
  const map = new Map(base.map((v) => [`${v.width}x${v.height}`, v]));
  for (const bp of breakpoints) {
    for (const d of [-1, 0, 1]) {
      const width = Math.round(bp + d);
      if (width < 280 || width > 3840) continue;
      const height = width <= 520 ? 844 : width <= 900 ? 1024 : 900;
      const key = `${width}x${height}`;
      if (!map.has(key)) {
        map.set(key, {
          name: `breakpoint-${Math.round(bp)}-${d === -1 ? "minus1" : d === 1 ? "plus1" : "exact"}-${width}x${height}`,
          width, height, source: "css-breakpoint"
        });
      }
    }
  }
  return [...map.values()].sort((a,b) => a.width-b.width || a.height-b.height).slice(0, max);
}

function parseBreakpointValues(mediaQueries = []) {
  const set = new Set();
  const re = /(?:min|max)-(?:device-)?width\s*:\s*([0-9.]+)\s*(px|em|rem)/gi;
  for (const q of mediaQueries) {
    let m;
    while ((m = re.exec(q))) {
      const n = Number(m[1]);
      if (!Number.isFinite(n)) continue;
      const px = m[2].toLowerCase() === "px" ? n : n * 16;
      if (px >= 200 && px <= 5000) set.add(px);
    }
  }
  return [...set].sort((a,b) => a-b);
}

async function collectCss(page) {
  return await page.evaluate(() => {
    const out = {
      rulesCount: 0,
      mediaQueries: [],
      containerQueries: [],
      supportsQueries: [],
      keyframes: [],
      fontFaces: [],
      pseudoStateRules: [],
      customProperties: {},
      inaccessibleStyleSheets: [],
      stylesheetHrefs: [],
    };
    const visit = (rules, href, context = []) => {
      if (!rules) return;
      for (const rule of rules) {
        out.rulesCount++;
        const ctor = rule.constructor?.name || "";
        const cssText = rule.cssText || "";
        if (ctor === "CSSMediaRule") {
          out.mediaQueries.push(rule.conditionText || "");
          visit(rule.cssRules, href, [...context, `@media ${rule.conditionText || ""}`]);
        } else if (ctor === "CSSContainerRule") {
          out.containerQueries.push(rule.conditionText || "");
          visit(rule.cssRules, href, [...context, "@container"]);
        } else if (ctor === "CSSSupportsRule") {
          out.supportsQueries.push(rule.conditionText || "");
          visit(rule.cssRules, href, [...context, "@supports"]);
        } else if (/KeyframesRule$/i.test(ctor)) {
          out.keyframes.push({ name: rule.name, cssText: cssText.slice(0, 12000), context });
        } else if (ctor === "CSSFontFaceRule") {
          out.fontFaces.push({
            family: rule.style.getPropertyValue("font-family").trim(),
            src: rule.style.getPropertyValue("src").trim(),
            weight: rule.style.getPropertyValue("font-weight").trim(),
            style: rule.style.getPropertyValue("font-style").trim(),
            display: rule.style.getPropertyValue("font-display").trim(),
          });
        } else if (ctor === "CSSStyleRule") {
          const selector = rule.selectorText || "";
          if (/(?:\:hover|\:focus(?:-visible|-within)?|\:active|\[aria-(?:expanded|selected|pressed|checked)|\[data-state=)/i.test(selector)) {
            out.pseudoStateRules.push({
              selector, declarations: rule.style.cssText, context
            });
          }
          for (let i=0; i<rule.style.length; i++) {
            const name = rule.style[i];
            if (name?.startsWith("--") && !(name in out.customProperties)) {
              out.customProperties[name] = rule.style.getPropertyValue(name).trim();
            }
          }
        } else if (rule.cssRules) {
          visit(rule.cssRules, href, context);
        }
      }
    };
    for (const sheet of [...document.styleSheets]) {
      out.stylesheetHrefs.push(sheet.href || null);
      try { visit(sheet.cssRules, sheet.href || location.href); }
      catch (e) { out.inaccessibleStyleSheets.push({ href: sheet.href || null, reason: e?.name || String(e) }); }
    }
    try {
      const cs = getComputedStyle(document.documentElement);
      for (let i=0; i<cs.length; i++) {
        const name = cs[i];
        if (name.startsWith("--")) out.customProperties[name] = cs.getPropertyValue(name).trim();
      }
    } catch {}
    return out;
  });
}

async function captureSnapshot(page, { maxElements = 7000 } = {}) {
  return await page.evaluate(({ STYLE_PROPS, maxElements }) => {
    const round = (n) => Number.isFinite(Number(n)) ? Math.round(Number(n) * 100) / 100 : null;
    const text = (s, n=2000) => {
      s = String(s || "").replace(/\s+/g, " ").trim()
        .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
        .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[PHONE]")
        .replace(/\b[A-Za-z0-9_-]{48,}\b/g, "[LONG_TOKEN]");
      return s.length > n ? s.slice(0,n) + "…" : s;
    };
    const visible = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.visibility === "collapse" || Number(cs.opacity) <= .001) return false;
      const r = el.getBoundingClientRect();
      return r.width > .25 && r.height > .25;
    };
    const selector = (el) => {
      if (el.id) return `#${CSS.escape(el.id)}`;
      const parts = [];
      let n = el;
      for (let depth=0; n && n.nodeType === 1 && depth<6; depth++, n=n.parentElement) {
        let part = n.tagName.toLowerCase();
        const testId = n.getAttribute("data-testid") || n.getAttribute("data-test") || n.getAttribute("data-qa");
        if (testId) { part += `[data-testid="${String(testId).replace(/"/g,'\\"')}"]`; parts.unshift(part); break; }
        const cls = [...n.classList].filter(c => c.length < 72 && !/[a-f0-9]{10,}/i.test(c)).slice(0,3);
        if (cls.length) part += "." + cls.map(CSS.escape).join(".");
        const p = n.parentElement;
        if (p) {
          const sib = [...p.children].filter(x => x.tagName === n.tagName);
          if (sib.length > 1) part += `:nth-of-type(${sib.indexOf(n)+1})`;
        }
        parts.unshift(part);
        if (p === document.body || p === document.documentElement) break;
      }
      return parts.join(" > ");
    };
    const accName = (el) => {
      const a = el.getAttribute("aria-label");
      if (a) return text(a, 400);
      const by = el.getAttribute("aria-labelledby");
      if (by) {
        const t = by.split(/\s+/).map(id => document.getElementById(id)?.textContent || "").join(" ").trim();
        if (t) return text(t,400);
      }
      return text(el.alt || el.title || el.placeholder || el.innerText || "", 400);
    };
    const styleMap = new Map();
    const styles = [];
    const elements = [];
    const all = [...document.querySelectorAll("*")];
    for (const el of all) {
      if (elements.length >= maxElements) break;
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      const s = {};
      for (const p of STYLE_PROPS) s[p] = cs.getPropertyValue(p).trim();
      const key = JSON.stringify(s);
      let styleId = styleMap.get(key);
      if (styleId == null) { styleId = styles.length; styles.push(s); styleMap.set(key, styleId); }
      const r = el.getBoundingClientRect();
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role");
      const interactive = ["button","a","input","textarea","select","summary","details"].includes(tag)
        || ["button","link","checkbox","radio","switch","tab","menuitem","option","slider","textbox","combobox"].includes(String(role || "").toLowerCase())
        || el.hasAttribute("contenteditable") || Number(el.getAttribute("tabindex")) >= 0;
      const pseudo = {};
      for (const ps of ["::before","::after"]) {
        try {
          const pcs = getComputedStyle(el, ps);
          const content = pcs.content;
          if (content && !["none","normal"].includes(content)) {
            pseudo[ps] = {
              content: text(content, 400),
              display: pcs.display,
              position: pcs.position,
              color: pcs.color,
              backgroundColor: pcs.backgroundColor,
              width: pcs.width,
              height: pcs.height,
              transform: pcs.transform,
            };
          }
        } catch {}
      }
      elements.push({
        index: elements.length,
        parentSelector: el.parentElement ? selector(el.parentElement) : null,
        selector: selector(el),
        tag, role,
        accessibleName: accName(el),
        text: text(el.innerText || "", 2000),
        classes: [...el.classList].slice(0,30),
        id: el.id || null,
        interactive,
        rect: {
          x: round(r.x), y: round(r.y), left: round(r.left), top: round(r.top),
          right: round(r.right), bottom: round(r.bottom), width: round(r.width), height: round(r.height)
        },
        styleId,
        attrs: {
          href: tag === "a" ? el.href || null : null,
          type: tag === "input" ? el.type || null : null,
          name: el.getAttribute("name"),
          placeholder: el.getAttribute("placeholder"),
          disabled: !!el.disabled,
          checked: typeof el.checked === "boolean" ? el.checked : null,
          ariaExpanded: el.getAttribute("aria-expanded"),
          ariaSelected: el.getAttribute("aria-selected"),
          ariaPressed: el.getAttribute("aria-pressed"),
          ariaCurrent: el.getAttribute("aria-current"),
          hasValue: ["input","textarea","select"].includes(tag) ? !!el.value : null,
        },
        pseudo
      });
    }
    const controls = elements.filter(e => e.interactive);
    const counts = {
      rendered: elements.length,
      controls: controls.length,
      buttons: elements.filter(e => e.tag === "button" || e.role === "button").length,
      links: elements.filter(e => e.tag === "a").length,
      inputs: elements.filter(e => e.tag === "input").length,
      textareas: elements.filter(e => e.tag === "textarea").length,
      selects: elements.filter(e => e.tag === "select").length,
      images: elements.filter(e => e.tag === "img").length,
      svg: elements.filter(e => e.tag === "svg").length,
      videos: elements.filter(e => e.tag === "video").length,
      audio: elements.filter(e => e.tag === "audio").length,
      headings: elements.filter(e => /^h[1-6]$/.test(e.tag)).length,
      fixed: elements.filter(e => styles[e.styleId]?.position === "fixed").length,
      sticky: elements.filter(e => styles[e.styleId]?.position === "sticky").length,
      smallTouchTargets: controls.filter(e => e.rect.width < 44 || e.rect.height < 44).length,
    };
    const textNodes = [];
    try {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode()) && textNodes.length < 25000) {
        const p = n.parentElement;
        if (!p || !visible(p)) continue;
        const t = text(n.nodeValue, 4000);
        if (t) textNodes.push({ selector: selector(p), text: t });
      }
    } catch {}
    const runtimeAnimations = [];
    try {
      for (const a of document.getAnimations({subtree:true}).slice(0,1000)) {
        let timing=null, keyframes=null, target=null;
        try { timing = a.effect?.getTiming?.() || null; } catch {}
        try { keyframes = a.effect?.getKeyframes?.().slice(0,80) || null; } catch {}
        try { target = a.effect?.target ? selector(a.effect.target) : null; } catch {}
        runtimeAnimations.push({
          id:a.id||null, playState:a.playState, playbackRate:a.playbackRate,
          currentTime:round(a.currentTime), target, timing, keyframes
        });
      }
    } catch {}
    return {
      url: location.href,
      title: document.title,
      viewport: {
        width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      },
      counts, styles, elements, textNodes, runtimeAnimations,
      meta: {
        lang: document.documentElement.lang || null,
        dir: document.documentElement.dir || null,
        canonical: document.querySelector('link[rel="canonical"]')?.href || null
      }
    };
  }, { STYLE_PROPS, maxElements });
}

async function collectAssetCandidates(page) {
  return await page.evaluate(() => {
    const out = [];
    const add = (url, type, selector, extra={}) => {
      try {
        const u = new URL(url, location.href).href;
        if (!/^https?:/.test(u)) return;
        out.push({ url:u, type, selector, ...extra });
      } catch {}
    };
    for (const img of document.images) {
      add(img.currentSrc || img.src, "image", img.id ? `#${CSS.escape(img.id)}` : "img", {
        naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, alt: img.alt || ""
      });
      if (img.srcset) for (const c of img.srcset.split(",")) add(c.trim().split(/\s+/)[0], "image-srcset", "img");
    }
    for (const v of document.querySelectorAll("video,audio")) {
      add(v.currentSrc || v.src, v.tagName.toLowerCase(), v.tagName.toLowerCase(), {
        duration: Number.isFinite(v.duration) ? v.duration : null,
        poster: v.poster || null,
        autoplay: !!v.autoplay,
        loop: !!v.loop,
        muted: !!v.muted,
        controls: !!v.controls
      });
      if (v.poster) add(v.poster, "video-poster", "video");
      for (const s of v.querySelectorAll("source[src]")) add(s.src, v.tagName.toLowerCase(), "source");
    }
    for (const l of document.querySelectorAll("link[href]")) {
      if (/stylesheet|icon|preload|modulepreload|manifest/i.test(l.rel || "")) add(l.href, l.rel || "link", `link[rel="${l.rel}"]`);
    }
    for (const s of document.querySelectorAll("script[src]")) add(s.src, "script", "script");
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      for (const prop of ["background-image","mask-image","-webkit-mask-image","content"]) {
        const v = cs.getPropertyValue(prop);
        for (const m of String(v).matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) add(m[2], prop.includes("mask") ? "icon-mask" : "css-url", el.tagName.toLowerCase());
      }
    }
    const DESIGN_INITIATORS = new Set(["img","image","script","css","link","font","video"]);
    const perf = performance.getEntriesByType("resource")
      .filter(r => DESIGN_INITIATORS.has(String(r.initiatorType || "").toLowerCase()))
      .map(r => ({
        url:r.name, type:`resource:${r.initiatorType||"other"}`, duration:r.duration, transferSize:r.transferSize||0
      }));
    for (const r of perf) add(r.url, r.type, "performance", {duration:r.duration,transferSize:r.transferSize});
    return out;
  });
}

function contentExt(type, contentType, url) {
  const ct = String(contentType || "").split(";")[0].toLowerCase();
  const map = {
    "image/png":".png","image/jpeg":".jpg","image/webp":".webp","image/avif":".avif","image/gif":".gif",
    "image/svg+xml":".svg","text/css":".css","application/javascript":".js","text/javascript":".js",
    "font/woff2":".woff2","font/woff":".woff","font/ttf":".ttf","font/otf":".otf",
    "video/mp4":".mp4","video/webm":".webm","audio/mpeg":".mp3","audio/ogg":".ogg","application/json":".json"
  };
  if (map[ct]) return map[ct];
  try { return new URL(url).pathname.match(/(\.[a-z0-9]{1,8})$/i)?.[1] || ""; } catch { return ""; }
}

function assetKind(type, ct, url) {
  const s = `${type} ${ct} ${url}`.toLowerCase();
  if (/font|woff|ttf|otf/.test(s)) return "fonts";
  if (/video|mp4|webm|mov|m3u8/.test(s)) return "videos";
  if (/audio|mp3|wav|ogg|m4a|flac/.test(s)) return "audio";
  if (/svg|icon|mask/.test(s)) return "icons";
  if (/image|png|jpg|jpeg|webp|avif|gif/.test(s)) return "images";
  if (/css|style/.test(s)) return "styles";
  if (/javascript|script|\.js/.test(s)) return "scripts";
  return "other";
}

async function saveAssets(context, candidates, outDir, {
  maxAssetBytes = 32*1024*1024,
  maxTotalBytes = 768*1024*1024,
  progress = () => {}
} = {}) {
  const unique = new Map();
  for (const c of candidates) {
    if (!c?.url) continue;
    if (!unique.has(c.url)) unique.set(c.url, {...c, usedAt:[]});
    unique.get(c.url).usedAt.push({selector:c.selector,type:c.type});
  }
  const manifest = [];
  let total = 0, i = 0;
  for (const item of unique.values()) {
    i++;
    progress(i, unique.size, item.url);
    const rec = {...item, downloaded:false, file:null, bytes:null, sha256:null, contentType:null, restriction:null};
    if (total >= maxTotalBytes) {
      rec.restriction = "TOTAL_ASSET_LIMIT";
      manifest.push(rec);
      continue;
    }
    try {
      const res = await context.request.get(item.url, { timeout: 30000, failOnStatusCode:false });
      rec.status = res.status();
      rec.contentType = res.headers()["content-type"] || "";
      if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
      const body = await res.body();
      if (body.length > maxAssetBytes) throw new Error(`ASSET_TOO_LARGE:${body.length}`);
      if (total + body.length > maxTotalBytes) throw new Error("TOTAL_ASSET_LIMIT");
      const sha = sha256Buffer(body);
      const ext = contentExt(item.type, rec.contentType, item.url);
      const base = safeSlug(new URL(item.url).pathname.split("/").pop() || "asset", 80);
      const kind = assetKind(item.type, rec.contentType, item.url);
      const rel = path.join("assets", kind, `${sha.slice(0,12)}-${base}${base.includes(".") ? "" : ext}`);
      await ensureDir(path.join(outDir, path.dirname(rel)));
      await fs.writeFile(path.join(outDir, rel), body);
      rec.downloaded = true;
      rec.file = rel.split(path.sep).join("/");
      rec.bytes = body.length;
      rec.sha256 = sha;
      total += body.length;
    } catch (e) {
      rec.restriction = String(e?.message || e);
    }
    manifest.push(rec);
  }
  await writeJson(path.join(outDir, "assets", "manifest.json"), manifest);
  return { manifest, bytesWritten: total, downloaded: manifest.filter(x=>x.downloaded).length };
}

async function discoverRoutes(page, context, startUrl, maxRoutes) {
  const origin = new URL(startUrl).origin;
  const found = new Map([[startUrl, {url:startUrl, source:"seed"}]]);
  async function add(raw, source, base=startUrl) {
    const u = normalizeRoute(raw, base, origin);
    if (u && !found.has(u) && found.size < maxRoutes) found.set(u, {url:u, source});
  }

  for (const href of await page.locator("a[href]").evaluateAll(els => els.map(a => a.href))) await add(href, "anchor", page.url());

  // sitemap / robots
  try {
    const robots = await context.request.get(`${origin}/robots.txt`, {failOnStatusCode:false, timeout:10000});
    const maps = new Set([`${origin}/sitemap.xml`]);
    if (robots.ok()) {
      const txt = await robots.text();
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*Sitemap:\s*(\S+)/i);
        if (m) maps.add(m[1]);
      }
    }
    const queue=[...maps].slice(0,8), seen=new Set();
    while (queue.length && seen.size < 12 && found.size < maxRoutes) {
      const u=queue.shift(); if (seen.has(u)) continue; seen.add(u);
      const r=await context.request.get(u,{failOnStatusCode:false,timeout:12000}).catch(()=>null);
      if (!r?.ok()) continue;
      const txt=await r.text();
      for (const m of txt.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)) {
        const loc=m[1].replace(/&amp;/g,"&");
        if (/sitemap/i.test(loc) && /\.xml/i.test(loc)) queue.push(loc);
        else await add(loc,"sitemap",origin);
      }
    }
  } catch {}

  // same-origin JS bundle route hints
  try {
    const scripts = await page.locator("script[src]").evaluateAll(els => els.map(s=>s.src).filter(Boolean));
    for (const src of scripts.slice(0,80)) {
      if (found.size >= maxRoutes) break;
      const r = await context.request.get(src,{failOnStatusCode:false,timeout:15000}).catch(()=>null);
      if (!r?.ok()) continue;
      const txt = (await r.text()).slice(0,10_000_000);
      const rx = /["'`](\/[A-Za-z0-9_~@.+\-/:?=&%]{1,220})["'`]/g;
      let m, n=0;
      while ((m=rx.exec(txt)) && n++<3000 && found.size<maxRoutes) {
        if (!STATIC_EXT.test(m[1]) && !m[1].includes("*")) await add(m[1],"bundle-hint",origin);
      }
    }
  } catch {}

  return [...found.values()];
}

async function detectTech(page) {
  return await page.evaluate(() => {
    const urls = [
      ...performance.getEntriesByType("resource").map(r=>r.name),
      ...[...document.scripts].map(s=>s.src).filter(Boolean)
    ].join("\n");
    const signals=[];
    const add=(name,confidence,evidence)=>signals.push({name,confidence,evidence});
    if (document.querySelector("#__next") || /\/_next\//.test(urls) || window.__NEXT_DATA__) add("Next.js","VERIFIED","/_next/ or __NEXT_DATA__");
    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || Object.keys(document.documentElement).some(k=>k.startsWith("__react"))) add("React","INFERRED","runtime/devtools marker");
    if (document.querySelector("[ng-version]") || window.ng) add("Angular","VERIFIED","ng-version/window.ng");
    if (window.__VUE__ || document.querySelector("[data-v-app]")) add("Vue","VERIFIED","Vue marker");
    if (/svelte/i.test(urls)) add("Svelte","INFERRED","resource marker");
    if (/@vite\/client|\/@id\//.test(urls)) add("Vite","VERIFIED","Vite resource");
    if (Object.keys(window).some(k=>/^webpackChunk/.test(k))) add("Webpack","INFERRED","webpack chunk global");
    if (/turbopack/i.test(urls)) add("Turbopack","INFERRED","resource marker");
    if (document.querySelector("style[data-emotion]")) add("Emotion","VERIFIED","style[data-emotion]");
    if (document.querySelector("style[data-styled]")) add("styled-components","VERIFIED","style[data-styled]");
    if (window.gsap || /gsap/i.test(urls)) add("GSAP","INFERRED","global/resource");
    if (/framer-motion|motion-dom/i.test(urls)) add("Framer Motion","INFERRED","resource marker");
    if (window.lottie || /lottie/i.test(urls)) add("Lottie","INFERRED","global/resource");
    return signals;
  });
}

async function scrollProbe(page) {
  return await page.evaluate(async () => {
    const candidates=[...document.querySelectorAll("*")].filter(el=>{
      const cs=getComputedStyle(el), r=el.getBoundingClientRect();
      return r.width>0&&r.height>0&&(cs.position==="fixed"||cs.position==="sticky"||/(auto|scroll)/.test(`${cs.overflowX} ${cs.overflowY}`));
    }).slice(0,300);
    const sel=(el)=>el.id?`#${CSS.escape(el.id)}`:el.tagName.toLowerCase()+"."+[...el.classList].slice(0,2).join(".");
    const maxY=Math.max(0,document.documentElement.scrollHeight-innerHeight);
    const points=[0,.25,.5,.75,1].map(v=>Math.round(maxY*v));
    const rec={};
    for(const y of points){
      scrollTo(0,y);
      await new Promise(r=>setTimeout(r,90));
      for(const el of candidates){
        const k=sel(el), b=el.getBoundingClientRect(), cs=getComputedStyle(el);
        (rec[k] ||= []).push({scrollY:y,x:b.x,y:b.y,width:b.width,height:b.height,position:cs.position,transform:cs.transform});
      }
    }
    scrollTo(0,0);
    return {maxScrollY:maxY,points,candidates:Object.entries(rec).map(([selector,samples])=>({selector,samples}))};
  });
}

async function liveInteractionProbe(page, limit=120) {
  const loc = page.locator("button,a[href],input,textarea,select,[role=button],[role=tab],[role=menuitem]");
  const count = Math.min(await loc.count(), limit);
  const out=[];
  for(let i=0;i<count;i++){
    const el=loc.nth(i);
    if (!(await el.isVisible().catch(()=>false))) continue;
    const before=await el.evaluate(e=>{const c=getComputedStyle(e);return {color:c.color,background:c.backgroundColor,border:c.borderColor,boxShadow:c.boxShadow,transform:c.transform,opacity:c.opacity,cursor:c.cursor}});
    let hover=null, focus=null;
    try { await el.hover({trial:false,timeout:1200}); hover=await el.evaluate(e=>{const c=getComputedStyle(e);return {color:c.color,background:c.backgroundColor,border:c.borderColor,boxShadow:c.boxShadow,transform:c.transform,opacity:c.opacity,cursor:c.cursor}}); } catch {}
    try { await el.focus({timeout:1200}); focus=await el.evaluate(e=>{const c=getComputedStyle(e);return {color:c.color,background:c.backgroundColor,border:c.borderColor,boxShadow:c.boxShadow,transform:c.transform,opacity:c.opacity,cursor:c.cursor}}); } catch {}
    out.push({
      index:i,
      selector:await el.evaluate(e=>e.id?`#${CSS.escape(e.id)}`:e.tagName.toLowerCase()+"."+[...e.classList].slice(0,3).join(".")),
      text:(await el.innerText().catch(()=>'' )).trim().slice(0,300),
      before,hover,focus,
      evidence:"VERIFIED"
    });
  }
  await page.mouse.move(1,1).catch(()=>{});
  return out;
}


const MODE_CONFIG = Object.freeze({
  "blueprint-fast": {
    label: "Blueprint Fast",
    settleMs: 180,
    fingerprintSettleMs: 100,
    maxElements: 3200,
    anchors: [
      ["phone-390x844",390,844],
      ["tablet-820x1180",820,1180],
      ["desktop-1440x900",1440,900],
    ],
    fingerprintViewports: [[1440,900],[390,844]],
    maxRepresentativeClusters: 20,
    boundaryScreenshots: false,
    deepEveryCanonicalRoute: false,
    skipBoundaryProbe: true,
    anchorOnlyProfiles: true,
    assetInventoryOnly: true,
    interactionLimit: 60,
  },
  "design-only": {
    label: "Design Only",
    settleMs: 320,
    fingerprintSettleMs: 180,
    maxElements: 5200,
    anchors: [
      ["phone-390x844",390,844],
      ["phone-430x932",430,932],
      ["phone-landscape-844x390",844,390],
      ["tablet-820x1180",820,1180],
      ["tablet-landscape-1024x768",1024,768],
      ["desktop-1440x900",1440,900],
      ["desktop-1920x1080",1920,1080],
    ],
    fingerprintViewports: [[1440,900],[390,844]],
    maxRepresentativeClusters: 24,
    boundaryScreenshots: false,
    deepEveryCanonicalRoute: false,
    skipBoundaryProbe: false,
    anchorOnlyProfiles: false,
    assetInventoryOnly: false,
    interactionLimit: 120,
  },
  "fast-deep": {
    label: "Fast Deep",
    settleMs: 350,
    fingerprintSettleMs: 220,
    maxElements: 5000,
    anchors: [
      ["phone-390x844",390,844],
      ["phone-430x932",430,932],
      ["tablet-768x1024",768,1024],
      ["tablet-820x1180",820,1180],
      ["tablet-landscape-1024x768",1024,768],
      ["desktop-1440x900",1440,900],
      ["desktop-1920x1080",1920,1080],
    ],
    fingerprintViewports: [[1440,900],[390,844]],
    maxRepresentativeClusters: 30,
    boundaryScreenshots: false,
    deepEveryCanonicalRoute: false,
    skipBoundaryProbe: false,
    anchorOnlyProfiles: false,
    assetInventoryOnly: false,
    interactionLimit: 120,
  },
  standard: {
    label: "Standard",
    settleMs: 500,
    fingerprintSettleMs: 260,
    maxElements: 6500,
    anchors: [
      ["phone-320x568",320,568],
      ["phone-360x800",360,800],
      ["phone-390x844",390,844],
      ["phone-430x932",430,932],
      ["phone-landscape-844x390",844,390],
      ["tablet-768x1024",768,1024],
      ["tablet-820x1180",820,1180],
      ["tablet-landscape-1024x768",1024,768],
      ["desktop-1280x720",1280,720],
      ["desktop-1440x900",1440,900],
      ["desktop-1920x1080",1920,1080],
      ["desktop-2560x1440",2560,1440],
    ],
    fingerprintViewports: [[1440,900],[390,844]],
    maxRepresentativeClusters: 50,
    boundaryScreenshots: false,
    deepEveryCanonicalRoute: false,
  },
  extreme: {
    label: "Extreme",
    settleMs: 650,
    fingerprintSettleMs: 300,
    maxElements: 8000,
    anchors: DEFAULT_VIEWPORTS.map(v=>[v.name,v.width,v.height]),
    fingerprintViewports: [[1440,900],[390,844]],
    maxRepresentativeClusters: 120,
    boundaryScreenshots: true,
    deepEveryCanonicalRoute: true,
  }
});

function modeConfig(mode) {
  const base = MODE_CONFIG[mode] || MODE_CONFIG["blueprint-fast"];
  return {
    skipBoundaryProbe:false,
    anchorOnlyProfiles:false,
    assetInventoryOnly:false,
    interactionLimit:120,
    ...base
  };
}

function routeHash(url) {
  return crypto.createHash("sha1").update(url).digest("hex").slice(0,10);
}

async function discoverRouteInventory(page, context, startUrl, {
  maxRoutes=80,
  maxCandidates=800,
  scanLocaleVariants=false,
  designOnly=true,
  includeRoutePattern="",
  excludeRoutePattern="",
  progress=()=>{},
  control=null,
}={}) {
  const origin = new URL(startUrl).origin;
  const includeRe = compilePattern(includeRoutePattern,"Include-route");
  const excludeRe = compilePattern(excludeRoutePattern,"Exclude-route");
  const candidates = new Map();
  const canonical = new Map();

  async function checkpoint() { if (control?.checkpoint) await control.checkpoint(); }

  function add(raw, source, base=startUrl) {
    if (candidates.size >= maxCandidates) return;
    const normalized = normalizeRoute(raw, base, origin);
    if (!normalized || !routeMatchesScope(normalized,includeRe,excludeRe)) return;
    if (!candidates.has(normalized)) candidates.set(normalized,{url:normalized,sources:new Set([source])});
    else candidates.get(normalized).sources.add(source);

    const c = canonicalizeRoute(normalized,{scanLocaleVariants});
    const template = designTemplateForRoute(c.canonicalUrl,{designOnly});
    const key = designOnly ? template.templateKey : c.canonicalUrl;
    let rec = canonical.get(key);
    if (!rec) {
      rec = {
        url:c.canonicalUrl,
        canonicalPath:c.canonicalPath,
        templateKey:template.templateKey,
        templatePath:template.templatePath,
        templateFamily:template.family,
        dynamicTemplate:template.dynamic,
        templateReason:template.reason,
        source,
        sources:new Set([source]),
        aliases:[],
        instances:[],
        locales:new Set(),
      };
      canonical.set(key,rec);
    } else rec.sources.add(source);
    if (c.canonicalUrl !== rec.url && !rec.instances.includes(c.canonicalUrl)) rec.instances.push(c.canonicalUrl);
    if (normalized !== c.canonicalUrl && !rec.aliases.includes(normalized)) rec.aliases.push(normalized);
    if (c.locale) rec.locales.add(c.locale);
  }

  add(startUrl,"seed",startUrl);
  for (const href of await page.locator("a[href]").evaluateAll(els=>els.map(a=>a.href)).catch(()=>[])) add(href,"anchor",page.url());

  await checkpoint();
  progress({stage:"routes:discovery",message:"Reading robots/sitemaps"});
  try {
    const robots=await context.request.get(`${origin}/robots.txt`,{failOnStatusCode:false,timeout:10000});
    const maps=new Set([`${origin}/sitemap.xml`]);
    if(robots.ok()){
      const txt=await robots.text();
      for(const line of txt.split(/\r?\n/)){const m=line.match(/^\s*Sitemap:\s*(\S+)/i);if(m)maps.add(m[1]);}
    }
    const queue=[...maps].slice(0,12),seen=new Set();
    while(queue.length&&seen.size<24&&candidates.size<maxCandidates){
      await checkpoint();
      const sm=queue.shift(); if(seen.has(sm))continue; seen.add(sm);
      const r=await context.request.get(sm,{failOnStatusCode:false,timeout:12000}).catch(()=>null);
      if(!r?.ok())continue;
      const txt=await r.text();
      for(const m of txt.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)){
        const loc=m[1].replace(/&amp;/g,"&");
        if(/sitemap/i.test(loc)&&/\.xml(?:$|\?)/i.test(loc))queue.push(loc);else add(loc,"sitemap",origin);
      }
    }
  } catch {}

  await checkpoint();
  progress({stage:"routes:discovery",message:"Inspecting frontend bundle route hints"});
  try {
    const scripts=await page.locator("script[src]").evaluateAll(els=>els.map(s=>s.src).filter(Boolean));
    for(const src of scripts.slice(0,80)){
      if(candidates.size>=maxCandidates)break;
      await checkpoint();
      const r=await context.request.get(src,{failOnStatusCode:false,timeout:15000}).catch(()=>null);
      if(!r?.ok())continue;
      const txt=(await r.text()).slice(0,12_000_000);
      const rx=/["'`](\/[A-Za-z0-9_~@.+\-/:?=&%]{1,220})["'`]/g;
      let m,n=0;
      while((m=rx.exec(txt))&&n++<5000&&candidates.size<maxCandidates){
        if(!STATIC_EXT.test(m[1])&&!m[1].includes("*")&&!m[1].includes("["))add(m[1],"bundle-hint",origin);
      }
    }
  } catch {}

  const seedCanonicalUrl = canonicalizeRoute(normalizeRoute(startUrl,startUrl,origin),{scanLocaleVariants}).canonicalUrl;
  const seedCanonical = designOnly ? designTemplateForRoute(seedCanonicalUrl,{designOnly:true}).templateKey : seedCanonicalUrl;
  const rows=[...canonical.values()].map(r=>({
    ...r,
    sources:[...r.sources],
    locales:[...r.locales],
  }));
  rows.sort((a,b)=>{
    if((a.templateKey||a.url)===seedCanonical)return -1;if((b.templateKey||b.url)===seedCanonical)return 1;
    const pa=new URL(a.url).pathname,pb=new URL(b.url).pathname;
    return pa.split("/").length-pb.split("/").length||pa.localeCompare(pb);
  });
  return {
    candidates:[...candidates.values()].map(x=>({...x,sources:[...x.sources]})),
    routes:rows.slice(0,maxRoutes),
    stats:{
      rawCandidates:candidates.size,
      canonicalRoutes:canonical.size,
      selectedCanonicalRoutes:Math.min(rows.length,maxRoutes),
      localeAliasesCollapsed:rows.reduce((n,r)=>n+r.aliases.length,0),
      contentInstancesCollapsed:rows.reduce((n,r)=>n+(r.instances?.length||0),0),
      dynamicTemplateFamilies:rows.filter(r=>r.dynamicTemplate).length,
      designOnly
    }
  };
}

async function waitPageReady(page, settleMs) {
  await page.evaluate(async()=>{try{await document.fonts.ready}catch{}}).catch(()=>{});
  if(settleMs>0)await page.waitForTimeout(settleMs);
}

async function compactFingerprint(page) {
  return await page.evaluate(() => {
    const quant=(n,q=8)=>Math.round(Number(n||0)/q)*q;
    const visible=(el)=>{const c=getComputedStyle(el),r=el.getBoundingClientRect();return c.display!=="none"&&c.visibility!=="hidden"&&Number(c.opacity)>.001&&r.width>.5&&r.height>.5};
    const els=[...document.querySelectorAll("body *")].filter(visible).slice(0,1800);
    const structural=[];
    const landmark=[];
    const counts={rendered:els.length,controls:0,buttons:0,links:0,inputs:0,headings:0,images:0,svg:0,fixed:0,sticky:0};
    for(const el of els){
      const tag=el.tagName.toLowerCase(),role=el.getAttribute("role")||"",c=getComputedStyle(el),r=el.getBoundingClientRect();
      const interactive=["button","a","input","textarea","select","summary"].includes(tag)||["button","link","tab","menuitem","textbox","combobox"].includes(role);
      if(interactive)counts.controls++;if(tag==="button"||role==="button")counts.buttons++;if(tag==="a")counts.links++;if(tag==="input")counts.inputs++;if(/^h[1-6]$/.test(tag))counts.headings++;if(tag==="img")counts.images++;if(tag==="svg")counts.svg++;if(c.position==="fixed")counts.fixed++;if(c.position==="sticky")counts.sticky++;
      const item=[tag,role,c.display,c.position,quant(r.x),quant(r.y),quant(r.width),quant(r.height),quant(parseFloat(c.fontSize)||0,2)].join(":");
      structural.push(item);
      if(["header","nav","main","aside","footer","section"].includes(tag)||["navigation","main","complementary","banner","contentinfo"].includes(role))landmark.push(item);
    }
    let h=2166136261;const text=structural.join("|");for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}
    return {
      signature:(h>>>0).toString(16).padStart(8,"0"),counts,
      viewport:{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,horizontalOverflow:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth)},
      landmarks:landmark.slice(0,120),
      title:document.title,
      lang:document.documentElement.lang||null,
    };
  });
}

async function fingerprintRoute(page, route, routeDir, cfg, options) {
  const file=path.join(routeDir,"fingerprint.json");
  if(options.resume && await fs.stat(file).then(()=>true).catch(()=>false)){
    return JSON.parse(await fs.readFile(file,"utf8"));
  }
  const records=[];
  let first=true;
  let fpIndex=0;
  for(const [width,height] of cfg.fingerprintViewports){
    await options.control?.checkpoint?.();
    await page.setViewportSize({width,height});
    if(first){
      await page.goto(route.url,{waitUntil:"domcontentloaded",timeout:options.navigationTimeout});
      first=false;
    }
    await waitPageReady(page,cfg.fingerprintSettleMs);
    const fp=await compactFingerprint(page);
    const shot=path.join(routeDir,"fingerprints",`${width}x${height}.png`);
    await ensureDir(path.dirname(shot));
    if(!(options.resume && await fs.stat(shot).then(()=>true).catch(()=>false))){
      await page.screenshot({path:shot,fullPage:false,animations:"disabled"}).catch(()=>{});
    }
    records.push({width,height,...fp,screenshot:path.relative(routeDir,shot).split(path.sep).join("/")});
    fpIndex++;
  }
  const clusterKey=records.map(r=>r.signature).join("|");
  const assets=await collectAssetCandidates(page).catch(()=>[]);
  const result={schema:"kk-frontend-route-fingerprint/v2.1",url:route.url,templateKey:route.templateKey,templatePath:route.templatePath,templateFamily:route.templateFamily,dynamicTemplate:route.dynamicTemplate,instances:route.instances||[],aliases:route.aliases,locales:route.locales,records,clusterKey,assets,capturedAt:new Date().toISOString(),evidenceStatus:"VERIFIED"};
  await writeJson(file,result);
  return result;
}

function clusterFingerprints(records,{deepEveryCanonicalRoute=false,maxRepresentativeClusters=30}={}){
  if(deepEveryCanonicalRoute){return records.slice(0,maxRepresentativeClusters).map((r,i)=>({id:`cluster-${i+1}`,key:`route:${r.route.url}`,representative:r.route,members:[r.route],fingerprint:r.fingerprint}));}
  const map=new Map();
  for(const rec of records){
    const key=rec.fingerprint.clusterKey;
    let c=map.get(key);if(!c){c={id:`cluster-${map.size+1}`,key,representative:rec.route,members:[],fingerprint:rec.fingerprint};map.set(key,c)}
    c.members.push(rec.route);
  }
  return [...map.values()].slice(0,maxRepresentativeClusters);
}

function normalizeBreakpointList(values){
  const out=[];
  for(const raw of [...new Set(values.map(v=>Math.round(Number(v))))].filter(v=>v>=280&&v<=2560).sort((a,b)=>a-b)){
    if(!out.length||raw-out[out.length-1]>=2)out.push(raw);
  }
  return out;
}

async function boundaryProbe(page, routeUrl, breakpoints, routeDir, cfg, options){
  const file=path.join(routeDir,"responsive-boundaries.json");
  if(options.resume && await fs.stat(file).then(()=>true).catch(()=>false)){
    return JSON.parse(await fs.readFile(file,"utf8"));
  }
  const probes=[];const meaningful=[];
  await page.setViewportSize({width:1440,height:900});
  await page.goto(routeUrl,{waitUntil:"domcontentloaded",timeout:options.navigationTimeout});
  await waitPageReady(page,cfg.fingerprintSettleMs);
  for(const bp of normalizeBreakpointList(breakpoints)){
    await options.control?.checkpoint?.();
    const samples=[];
    for(const delta of [-1,0,1]){
      const width=Math.max(280,bp+delta),height=width<=520?844:width<=900?1024:900;
      await page.setViewportSize({width,height});
      await page.waitForTimeout(90);
      samples.push({delta,width,height,...await compactFingerprint(page)});
    }
    const change=samples[0].signature!==samples[2].signature||samples[0].counts.controls!==samples[2].counts.controls||samples[0].viewport.horizontalOverflow!==samples[2].viewport.horizontalOverflow;
    probes.push({breakpoint:bp,meaningfulChange:change,samples});
    if(change)meaningful.push(bp);
  }
  const result={schema:"kk-frontend-responsive-boundaries/v2",route:routeUrl,breakpoints:normalizeBreakpointList(breakpoints),meaningfulBreakpoints:meaningful,probes,evidenceStatus:"VERIFIED"};
  await writeJson(file,result);return result;
}

function buildDeepProfiles(cfg, meaningfulBreakpoints){
  const map=new Map(cfg.anchors.map(([name,width,height])=>[`${width}x${height}`,{name,width,height,source:"representative"}]));
  for(const bp of meaningfulBreakpoints){
    const width=Math.round(bp),height=width<=520?844:width<=900?1024:900;
    const key=`${width}x${height}`;if(!map.has(key))map.set(key,{name:`meaningful-breakpoint-${width}x${height}`,width,height,source:"meaningful-breakpoint"});
  }
  return [...map.values()].sort((a,b)=>a.width-b.width||a.height-b.height);
}

async function profileScan(page, routeDir, routeUrl, profile, options) {
  const file=path.join(routeDir,"profiles",`${safeSlug(profile.name)}.json`);
  const screenshot=path.join(routeDir,"screenshots",`${safeSlug(profile.name)}.png`);
  if(options.resume){
    const ok=await Promise.all([fs.stat(file).then(()=>true).catch(()=>false),fs.stat(screenshot).then(()=>true).catch(()=>false)]);
    if(ok.every(Boolean)){
      const snap=JSON.parse(await fs.readFile(file,"utf8"));
      return {profile,file:path.relative(routeDir,file).split(path.sep).join("/"),screenshot:path.relative(routeDir,screenshot).split(path.sep).join("/"),viewport:snap.viewport,counts:snap.counts,resumed:true};
    }
  }
  await options.control?.checkpoint?.();
  await page.setViewportSize({width:profile.width,height:profile.height});
  await page.goto(routeUrl,{waitUntil:"domcontentloaded",timeout:options.navigationTimeout});
  await waitPageReady(page,options.settleMs);
  const snap=await captureSnapshot(page,{maxElements:options.maxElements});
  snap.profile=profile;snap.evidenceStatus="VERIFIED";
  await writeJson(file,snap);
  await ensureDir(path.dirname(screenshot));
  await page.screenshot({path:screenshot,fullPage:true,animations:"disabled"});
  return {profile,file:path.relative(routeDir,file).split(path.sep).join("/"),screenshot:path.relative(routeDir,screenshot).split(path.sep).join("/"),viewport:snap.viewport,counts:snap.counts,resumed:false};
}

function aggregateTokens(profileSnapshots) {
  const colors=new Map(),fontSizes=new Map(),fonts=new Map(),radii=new Map(),spacing=new Map();
  const inc=(m,v)=>{if(v&&v!=="0px"&&v!=="normal"&&v!=="rgba(0, 0, 0, 0)")m.set(v,(m.get(v)||0)+1)};
  for(const snap of profileSnapshots){for(const el of snap.elements||[]){const s=snap.styles?.[el.styleId]||{};inc(colors,s.color);inc(colors,s["background-color"]);inc(fontSizes,s["font-size"]);inc(fonts,s["font-family"]);for(const k of ["border-top-left-radius","border-top-right-radius","border-bottom-left-radius","border-bottom-right-radius"])inc(radii,s[k]);for(const k of ["gap","row-gap","column-gap","padding-top","padding-right","padding-bottom","padding-left","margin-top","margin-right","margin-bottom","margin-left"])inc(spacing,s[k]);}}
  const top=(m,n=120)=>[...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,n).map(([value,count])=>({value,count}));
  return {colors:top(colors),fontSizes:top(fontSizes),fontFamilies:top(fonts,60),radii:top(radii),spacing:top(spacing)};
}

async function loadAssetManifest(outDir){
  try{const x=JSON.parse(await fs.readFile(path.join(outDir,"assets","manifest.json"),"utf8"));return Array.isArray(x)?x:[]}catch{return[]}
}

async function saveAssetsIncremental(context,candidates,outDir,{maxAssetBytes=32*1024*1024,maxTotalBytes=768*1024*1024,progress=()=>{},control=null,designOnly=true,inventoryOnly=false}={}){
  const previous=await loadAssetManifest(outDir);const byUrl=new Map(previous.map(x=>[x.url,x]));
  let total=previous.filter(x=>x.downloaded).reduce((n,x)=>n+(x.bytes||0),0);
  for(const c of candidates){
    if(!c?.url)continue;
    const classification=classifyDesignAsset(c,{designOnly});
    let rec=byUrl.get(c.url);
    if(!rec){
      rec={...c,usedAt:[],downloaded:false,file:null,bytes:null,sha256:null,contentType:null,restriction:classification.include?null:`DESIGN_ONLY_SKIP:${classification.reason}`,designAsset:classification.include,designReason:classification.reason};
      byUrl.set(c.url,rec);
    }
    if(c.route||c.selector||c.type){
      const use={route:c.route||null,selector:c.selector||null,type:c.type||null};
      if(!rec.usedAt.some(x=>JSON.stringify(x)===JSON.stringify(use)))rec.usedAt.push(use);
    }
  }
  if(inventoryOnly){
    for(const rec of byUrl.values()){
      if(!rec.downloaded && !rec.restriction) rec.inventoryOnly=true;
    }
    const manifest=[...byUrl.values()];
    await writeJson(path.join(outDir,"assets","manifest.json"),manifest);
    return {manifest,bytesWritten:total,downloaded:manifest.filter(x=>x.downloaded).length,inventoryOnly:true};
  }
  const pending=[...byUrl.values()].filter(x=>!x.downloaded&&!x.restriction);
  let i=0;
  for(const rec of pending){
    await control?.checkpoint?.();i++;progress(i,pending.length,rec.url);
    if(total>=maxTotalBytes){rec.restriction="TOTAL_ASSET_LIMIT";continue}
    try{
      const res=await context.request.get(rec.url,{timeout:30000,failOnStatusCode:false});rec.status=res.status();rec.contentType=res.headers()["content-type"]||"";if(!res.ok())throw new Error(`HTTP ${res.status()}`);
      const body=await res.body();if(body.length>maxAssetBytes)throw new Error(`ASSET_TOO_LARGE:${body.length}`);if(total+body.length>maxTotalBytes)throw new Error("TOTAL_ASSET_LIMIT");
      const sha=sha256Buffer(body),ext=contentExt(rec.type,rec.contentType,rec.url),base=safeSlug(new URL(rec.url).pathname.split("/").pop()||"asset",80),kind=assetKind(rec.type,rec.contentType,rec.url),rel=path.join("assets",kind,`${sha.slice(0,12)}-${base}${base.includes(".")?"":ext}`);
      await ensureDir(path.join(outDir,path.dirname(rel)));await fs.writeFile(path.join(outDir,rel),body);rec.downloaded=true;rec.file=rel.split(path.sep).join("/");rec.bytes=body.length;rec.sha256=sha;total+=body.length;
    }catch(e){rec.restriction=String(e?.message||e)}
  }
  const manifest=[...byUrl.values()];await writeJson(path.join(outDir,"assets","manifest.json"),manifest);return{manifest,bytesWritten:total,downloaded:manifest.filter(x=>x.downloaded).length};
}

function etaTracker(progress){
  const times=[];let last=Date.now();let completed=0,total=1;
  return {
    setTotal(n){total=Math.max(1,n)},
    tick(payload={}){const now=Date.now();if(completed>0)times.push(now-last);last=now;completed++;if(times.length>20)times.shift();const avg=times.length?times.reduce((a,b)=>a+b,0)/times.length:0;const eta=avg?Math.round((total-completed)*avg/1000):null;progress({...payload,etaSeconds:eta,completedUnits:completed,totalUnits:total})}
  };
}

async function writePartialAudit(outDir,data){
  await writeJson(path.join(outDir,"audit.partial.json"),{...data,updatedAt:new Date().toISOString(),evidenceStatus:"PARTIAL"});
}

export async function scanWebsite({
  url,
  outDir,
  maxRoutes=60,
  maxCandidates=800,
  mode="blueprint-fast",
  designOnly=true,
  headless=false,
  downloadAssets=true,
  navigationTimeout=25000,
  settleMs=null,
  maxElements=null,
  storageStatePath=null,
  scanLocaleVariants=false,
  includeRoutePattern="",
  excludeRoutePattern="",
  resume=true,
  progress=()=>{},
  control=null,
}){
  await ensureDir(outDir);
  const cfg=modeConfig(mode);const effectiveSettle=settleMs??cfg.settleMs,effectiveMaxElements=maxElements??cfg.maxElements;
  const browser=await chromium.launch({headless});
  const context=await browser.newContext({viewport:{width:1440,height:900},storageState:storageStatePath||undefined,serviceWorkers:"allow",locale:"en-US"});
  const page=await context.newPage();
  const networkErrors=[],consoleErrors=[];page.on("requestfailed",req=>networkErrors.push({url:req.url(),failure:req.failure()?.errorText||"unknown"}));page.on("console",msg=>{if(["error","warning"].includes(msg.type()))consoleErrors.push({type:msg.type(),text:msg.text().slice(0,2000),url:page.url()})});
  const routeResults=[],assetCandidates=[];
  const partial={schema:"kk-frontend-audit/v2.2",kind:"runtime-website",target:url,mode,designOnly,capturedAt:new Date().toISOString(),routeInventory:null,clusters:[],routes:[],assets:null,runtime:{consoleErrors,networkErrors},cancelled:false};
  try{
    await control?.checkpoint?.();progress({stage:"reference:open",progress:2,message:`Opening ${url}`});
    await page.goto(url,{waitUntil:"domcontentloaded",timeout:navigationTimeout});await waitPageReady(page,effectiveSettle);
    const technology=await detectTech(page);const sharedCss=await collectCss(page);const globalBreakpoints=parseBreakpointValues(sharedCss.mediaQueries);
    await writeJson(path.join(outDir,"shared-css.json"),{...sharedCss,breakpointsPx:globalBreakpoints,evidenceStatus:"VERIFIED",capturedAt:new Date().toISOString(),route:url});
    await writeJson(path.join(outDir,"technology.json"),technology);
    partial.technology=technology;partial.sharedCssFile="shared-css.json";

    const inventory=await discoverRouteInventory(page,context,url,{maxRoutes,maxCandidates,scanLocaleVariants,designOnly,includeRoutePattern,excludeRoutePattern,progress,control});
    partial.routeInventory=inventory;await writeJson(path.join(outDir,"route-inventory.json"),inventory);progress({stage:"routes",progress:7,etaSeconds:null,completedUnits:0,totalUnits:inventory.routes.length,message:`${inventory.stats.rawCandidates} raw URLs → ${inventory.routes.length} design-route templates (${inventory.stats.localeAliasesCollapsed} locale aliases + ${inventory.stats.contentInstancesCollapsed} content instances collapsed)`});

    const fpTracker=etaTracker(progress);fpTracker.setTotal(inventory.routes.length);
    const fingerprintRecords=[];
    for(let i=0;i<inventory.routes.length;i++){
      await control?.checkpoint?.();const route=inventory.routes[i],routeSlug=`${safeSlug(new URL(route.url).pathname||"root")}-${routeHash(route.url)}`,routeDir=path.join(outDir,"routes",routeSlug);await ensureDir(routeDir);
      progress({stage:"fingerprint",progress:8+Math.round((i/Math.max(inventory.routes.length,1))*18),message:`Fingerprint ${i+1}/${inventory.routes.length}: ${route.url}`});
      try{const fingerprint=await fingerprintRoute(page,route,routeDir,cfg,{resume,navigationTimeout,control});fingerprintRecords.push({route,fingerprint,routeDir,routeSlug});assetCandidates.push(...(fingerprint.assets||[]).map(a=>({...a,route:route.url,fingerprint:true})));}
      catch(e){fingerprintRecords.push({route,error:String(e?.message||e),routeDir,routeSlug});}
      fpTracker.tick({stage:"fingerprint",progress:8+Math.round(((i+1)/Math.max(inventory.routes.length,1))*18),message:`Fingerprint ${i+1}/${inventory.routes.length}: ${route.url}`});
      if((i+1)%5===0)await writePartialAudit(outDir,{...partial,fingerprinted:i+1});
      if(downloadAssets && !cfg.assetInventoryOnly && (i+1)%10===0 && assetCandidates.length){
        await saveAssetsIncremental(context,assetCandidates,outDir,{control,designOnly,progress:(ai,an,au)=>progress({stage:"assets-cache",progress:8+Math.round(((i+1)/Math.max(inventory.routes.length,1))*18),message:`Caching asset ${ai}/${an}: ${au.slice(0,100)}`})});
      }
    }

    const validFp=fingerprintRecords.filter(x=>x.fingerprint);const clusters=clusterFingerprints(validFp,{deepEveryCanonicalRoute:cfg.deepEveryCanonicalRoute,maxRepresentativeClusters:cfg.maxRepresentativeClusters});
    partial.clusters=clusters.map(c=>({id:c.id,key:c.key,representative:c.representative.url,members:c.members.map(m=>m.url)}));
    await writeJson(path.join(outDir,"layout-clusters.json"),partial.clusters);
    progress({stage:"cluster",progress:28,message:`${validFp.length} canonical routes grouped into ${clusters.length} unique visual-layout clusters`});

    const deepTracker=etaTracker(progress);deepTracker.setTotal(clusters.length);
    for(let cIndex=0;cIndex<clusters.length;cIndex++){
      await control?.checkpoint?.();const cluster=clusters[cIndex],route=cluster.representative,rec=validFp.find(x=>x.route.url===route.url),routeDir=rec.routeDir,routeSlug=rec.routeSlug;
      const basePct=30+Math.round((cIndex/Math.max(clusters.length,1))*54);progress({stage:"deep-route",progress:basePct,message:`Deep representative ${cIndex+1}/${clusters.length}: ${route.url} (${cluster.members.length} equivalent route(s))`});
      try{
        await page.setViewportSize({width:1440,height:900});
        await page.goto(route.url,{waitUntil:"domcontentloaded",timeout:navigationTimeout});
        await waitPageReady(page,cfg.fingerprintSettleMs);
        const routeCss=await collectCss(page);
        const routeBreakpoints=normalizeBreakpointList([...globalBreakpoints,...parseBreakpointValues(routeCss.mediaQueries)]);
        await writeJson(path.join(routeDir,"route-css.json"),{...routeCss,breakpointsPx:routeBreakpoints,evidenceStatus:"VERIFIED"});
        const boundaries=cfg.skipBoundaryProbe
          ? {schema:"kk-frontend-responsive-boundaries/v2.2",route:route.url,breakpoints:routeBreakpoints,meaningfulBreakpoints:[],probes:[],evidenceStatus:"VERIFIED_CSS_DECLARATIONS_ONLY",note:"Blueprint Fast records exact CSS breakpoint declarations but skips -1/exact/+1 rendered boundary probing for speed."}
          : await boundaryProbe(page,route.url,routeBreakpoints,routeDir,cfg,{resume,navigationTimeout,control});
        if(cfg.skipBoundaryProbe) await writeJson(path.join(routeDir,"responsive-boundaries.json"),boundaries);
        const profiles=cfg.anchorOnlyProfiles
          ? cfg.anchors.map(([name,width,height])=>({name,width,height,source:"blueprint-anchor"}))
          : buildDeepProfiles(cfg,boundaries.meaningfulBreakpoints);
        const profileSummaries=[],tokenSnaps=[];
        for(let pIndex=0;pIndex<profiles.length;pIndex++){
          await control?.checkpoint?.();const prof=profiles[pIndex];progress({stage:"scan-profile",progress:basePct,message:`${route.url} — ${pIndex+1}/${profiles.length} ${prof.name}`});
          try{const summary=await profileScan(page,routeDir,route.url,prof,{resume,navigationTimeout,settleMs:effectiveSettle,maxElements:effectiveMaxElements,control});profileSummaries.push(summary);if(cfg.anchorOnlyProfiles || ["phone-390x844","tablet-820x1180","desktop-1440x900"].includes(prof.name)){tokenSnaps.push(JSON.parse(await fs.readFile(path.join(routeDir,summary.file),"utf8")));}}
          catch(e){profileSummaries.push({profile:prof,error:String(e?.message||e),evidenceStatus:"UNAVAILABLE"});}
        }
        await page.setViewportSize({width:1440,height:900});await page.goto(route.url,{waitUntil:"domcontentloaded",timeout:navigationTimeout});await waitPageReady(page,effectiveSettle);
        const scrollBehavior=await scrollProbe(page).catch(e=>({evidenceStatus:"UNAVAILABLE",reason:String(e?.message||e)}));const interactions=await liveInteractionProbe(page,cfg.interactionLimit).catch(()=>[]);const assets=await collectAssetCandidates(page);assetCandidates.push(...assets.map(a=>({...a,route:route.url,clusterId:cluster.id})));
        const routeData={schema:"kk-frontend-route/v2.1",url:route.url,templateKey:route.templateKey,templatePath:route.templatePath,templateFamily:route.templateFamily,dynamicTemplate:route.dynamicTemplate,instances:route.instances||[],source:route.source,aliases:route.aliases,locales:route.locales,title:await page.title(),clusterId:cluster.id,clusterMembers:cluster.members.map(m=>m.url),evidenceStatus:"VERIFIED",sharedCssFile:"../../shared-css.json",cssFile:"route-css.json",breakpoints:{all:boundaries.breakpoints,meaningful:boundaries.meaningfulBreakpoints,boundaryEvidence:"responsive-boundaries.json"},viewports:profileSummaries,designTokens:aggregateTokens(tokenSnaps),interactions,scrollBehavior,assetsDiscovered:assets.length};
        await writeJson(path.join(routeDir,"route.json"),routeData);routeResults.push({...routeData,file:`routes/${routeSlug}/route.json`});
        if(downloadAssets&&!cfg.assetInventoryOnly&&assets.length){await saveAssetsIncremental(context,assetCandidates,outDir,{control,designOnly,progress:(i,n,u)=>progress({stage:"assets-incremental",progress:basePct,message:`Asset ${i}/${n}: ${u.slice(0,100)}`})});}
      }catch(e){const failed={schema:"kk-frontend-route/v2",url:route.url,source:route.source,clusterId:cluster.id,status:"UNAVAILABLE",reason:String(e?.message||e),file:`routes/${routeSlug}/route.json`};await writeJson(path.join(routeDir,"route.json"),failed);routeResults.push(failed);}
      deepTracker.tick({stage:"deep-route",progress:30+Math.round(((cIndex+1)/Math.max(clusters.length,1))*54),message:`Completed representative ${cIndex+1}/${clusters.length}: ${route.url}`});
      partial.routes=routeResults.map(r=>({url:r.url,clusterId:r.clusterId,evidenceStatus:r.evidenceStatus||r.status,file:r.file,viewports:r.viewports?.length||0}));await writePartialAudit(outDir,partial);
    }

    // Every canonical route retains explicit coverage mapping, even when it reuses a structurally equivalent representative.
    const memberMap=new Map();for(const c of clusters)for(const m of c.members)memberMap.set(m.url,{clusterId:c.id,representative:c.representative.url});
    const coverageRoutes=inventory.routes.map(r=>{const m=memberMap.get(r.url);const rep=routeResults.find(x=>x.url===m?.representative);return{url:r.url,templateKey:r.templateKey,templatePath:r.templatePath,templateFamily:r.templateFamily,dynamicTemplate:r.dynamicTemplate,instances:r.instances||[],aliases:r.aliases,locales:r.locales,source:r.source,clusterId:m?.clusterId||null,representative:m?.representative||null,deepScanned:r.url===m?.representative,evidenceStatus:rep?.evidenceStatus||rep?.status||"UNAVAILABLE",representativeFile:rep?.file||null};});
    await writeJson(path.join(outDir,"route-coverage.json"),coverageRoutes);

    progress({stage:"assets",progress:88,message:cfg.assetInventoryOnly?`Final design-asset inventory (${assetCandidates.length} references)`:`Final asset dedup/download pass (${assetCandidates.length} references)`});const assetResult=downloadAssets?await saveAssetsIncremental(context,assetCandidates,outDir,{control,designOnly,inventoryOnly:cfg.assetInventoryOnly,progress:(i,n,u)=>progress({stage:"assets",progress:88+Math.round((i/Math.max(n,1))*7),message:`Asset ${i}/${n}: ${u.slice(0,120)}`})}):{manifest:assetCandidates,downloaded:0,bytesWritten:0,inventoryOnly:true};

    const master={schema:"kk-frontend-audit/v2.2",kind:"runtime-website",target:url,mode,designOnly,capturedAt:new Date().toISOString(),evidenceStatus:"VERIFIED",technology,sharedCssFile:"shared-css.json",routeInventoryFile:"route-inventory.json",layoutClustersFile:"layout-clusters.json",routeCoverageFile:"route-coverage.json",coverage:{rawRoutesDiscovered:inventory.stats.rawCandidates,designRouteTemplates:inventory.routes.length,canonicalRouteFamilies:inventory.stats.canonicalRoutes,localeAliasesCollapsed:inventory.stats.localeAliasesCollapsed,contentInstancesCollapsed:inventory.stats.contentInstancesCollapsed,dynamicTemplateFamilies:inventory.stats.dynamicTemplateFamilies,uniqueVisualClusters:clusters.length,deepRepresentativesScanned:routeResults.filter(r=>r.evidenceStatus==="VERIFIED").length,routeFailures:routeResults.filter(r=>r.evidenceStatus!=="VERIFIED").length,globalBreakpointsPx:globalBreakpoints,mode,cachingResume:resume,note:mode==="blueprint-fast"?"BLUEPRINT FAST: content instances and locale aliases are collapsed; each design template is fingerprinted at desktop+mobile; each unique visual cluster receives exact full snapshots only at mobile/tablet/desktop anchors; readable CSS breakpoint declarations, states, animations, assets and route structure are still recorded.":"DESIGN-ONLY: individual content instances such as /song/:id, /playlist/:id, /album/:id and /profile/:slug are collapsed to one representative template. Locale aliases are collapsed by default. Each design template receives desktop+mobile structural fingerprints, then deep responsive evidence is captured once per unique visual-layout cluster; every CSS breakpoint is probed at -1/exact/+1 using compact exact geometry, and meaningful breakpoints are promoted to full snapshots."},routes:coverageRoutes,representativeRoutes:routeResults.map(r=>({url:r.url,templateKey:r.templateKey,clusterId:r.clusterId,evidenceStatus:r.evidenceStatus||r.status,file:r.file,viewports:r.viewports?.length||0})),assets:{strategy:cfg.assetInventoryOnly?"inventory-only":"download",discovered:assetResult.manifest.length,downloaded:assetResult.downloaded,skippedDesignNoise:assetResult.manifest.filter(x=>String(x.restriction||"").startsWith("DESIGN_ONLY_SKIP:")).length,bytesWritten:assetResult.bytesWritten,manifest:"assets/manifest.json"},runtime:{consoleErrors,networkErrors},restrictions:["Unknown private routes not exposed by links/sitemaps/bundle evidence remain UNAVAILABLE.","Design-only mode intentionally does not crawl every song/album/profile instance; it records the family and scans one representative layout.","Song audio, API/telemetry/ad requests and non-decorative content video are excluded from asset downloads.","Safe scanner does not click destructive or state-changing controls.","Native iOS/Safari/Android rasterization requires native-device verification; Chromium viewport evidence is not relabeled as native proof."],cancelled:false};
    await writeJson(path.join(outDir,"audit.json"),master);await writeJson(path.join(outDir,"runtime-errors.json"),{consoleErrors,networkErrors});await fs.rm(path.join(outDir,"audit.partial.json"),{force:true}).catch(()=>{});progress({stage:"done",progress:100,etaSeconds:0,completedUnits:clusters.length,totalUnits:clusters.length,message:`${mode==="blueprint-fast"?"Blueprint Fast":"Design"} scan complete: ${inventory.routes.length} design templates, ${inventory.stats.contentInstancesCollapsed} content instances collapsed, ${clusters.length} unique visual clusters`});return master;
  }catch(e){
    if(e?.code==="KK_STOP"){
      partial.cancelled=true;partial.cancelledAt=new Date().toISOString();partial.runtime={consoleErrors,networkErrors};await writePartialAudit(outDir,partial);return{...partial,evidenceStatus:"PARTIAL",cancelled:true};
    }
    throw e;
  }finally{await context.close().catch(()=>{});await browser.close().catch(()=>{});}
}

export async function compareScreenshots(referencePng, targetPng, outFile) {
  const a=PNG.sync.read(await fs.readFile(referencePng)),b=PNG.sync.read(await fs.readFile(targetPng));const width=Math.min(a.width,b.width),height=Math.min(a.height,b.height),aa=new PNG({width,height}),bb=new PNG({width,height}),diff=new PNG({width,height});PNG.bitblt(a,aa,0,0,width,height,0,0);PNG.bitblt(b,bb,0,0,width,height,0,0);const mismatched=pixelmatch(aa.data,bb.data,diff.data,width,height,{threshold:.12,includeAA:true});await ensureDir(path.dirname(outFile));await fs.writeFile(outFile,PNG.sync.write(diff));return{width,height,mismatched,pct:Math.round((mismatched/(width*height))*10000)/100};
}
