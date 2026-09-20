import dns from "node:dns/promises";
import net from "node:net";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildEvidenceCompanion, candidateFamily, classifyCandidate, normalizeReferenceUrl, renderDesignMd } from "./design-md.mjs";
import { containsReferenceAuthSecret, normalizeReferenceAuth, parseCookieHeader, referenceAuthHeader, referenceAuthSummary } from "./auth.mjs";

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
    authentication: {
      modes: ["public","login","cookie","header","basic"],
      secretsPersisted: false,
      captchaBypass: false,
      mfaBypass: false,
    },
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

async function installNetworkGuard(page, { authHeader = null, authOrigin = "" } = {}) {
  if (env("KK_REFERENCE_ALLOW_PRIVATE").toLowerCase() === "true" && !authHeader) return null;
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
      if (env("KK_REFERENCE_ALLOW_PRIVATE").toLowerCase() !== "true") {
        await assertPublicReferenceUrl(requestUrl, dnsCache);
      }
      let headers;
      if (authHeader && parsed.origin === authOrigin) {
        const merged = { ...(event.request?.headers || {}) };
        for (const key of Object.keys(merged)) {
          if (key.toLowerCase() === authHeader.name.toLowerCase()) delete merged[key];
        }
        merged[authHeader.name] = authHeader.value;
        headers = Object.entries(merged).map(([name,value]) => ({ name, value:String(value) }));
      }
      await session.send("Fetch.continueRequest", { requestId, ...(headers ? { headers } : {}) }).catch(() => {});
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

async function pageForBrowser(browser, auth, targetUrl) {
  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(12_000);
  page.setDefaultNavigationTimeout(45_000);
  const authHeader = referenceAuthHeader(auth);
  await installNetworkGuard(page, {
    authHeader,
    authOrigin: authHeader ? new URL(targetUrl).origin : "",
  });
  return page;
}

async function gotoReference(page, url) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => {});
  await page.waitForTimeout(350);
  await assertPublicReferenceUrl(page.url());
  return response;
}

async function firstVisibleLocator(page, selectors) {
  for (const selector of selectors.filter(Boolean)) {
    try {
      const locator = page.locator(selector).first();
      if (await locator.isVisible({ timeout: 650 })) return locator;
    } catch {}
  }
  return null;
}

async function submitLoginStep(page, customSelector = "") {
  const submit = await firstVisibleLocator(page, [
    customSelector,
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Sign in")',
    'button:has-text("Log in")',
    'button:has-text("Login")',
    'button:has-text("Continue")',
    'button:has-text("Next")',
  ]);
  if (submit) {
    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: 12_000 }).catch(() => {}),
      submit.click({ timeout: 5_000 }),
    ]);
    await page.waitForTimeout(450);
    return;
  }
  const active = page.locator('input[type="password"],input[autocomplete="username"],input[type="email"]').last();
  await active.press("Enter", { timeout: 3_000 });
  await page.waitForTimeout(450);
}

function assertCredentialOrigin(page, auth) {
  const approved = new URL(auth.loginUrl);
  const current = new URL(page.url());
  if (current.origin !== approved.origin) {
    const hint = auth.loginUrlExplicit
      ? "The configured login page redirected to another origin."
      : "The reference redirected to a different login origin.";
    throw new Error(`${hint} For safety, credentials were not entered. Explicitly use that login URL if you trust it, or use Session Cookie mode for SSO/MFA.`);
  }
}

async function performFormLogin(page, auth, targetUrl) {
  await gotoReference(page, auth.loginUrl || targetUrl);
  assertCredentialOrigin(page, auth);

  const username = await firstVisibleLocator(page, [
    auth.usernameSelector,
    'input[autocomplete="username"]',
    'input[type="email"]',
    'input[name*="email" i]',
    'input[name*="user" i]',
    'input[name*="login" i]',
    'input[type="text"]',
  ]);
  if (!username) throw new Error("Login form username/email field was not detected. Open Advanced login settings and provide its selector.");
  await username.fill(auth.username);

  let password = await firstVisibleLocator(page, [
    auth.passwordSelector,
    'input[autocomplete="current-password"]',
    'input[type="password"]',
  ]);

  if (!password) {
    await submitLoginStep(page, auth.submitSelector);
    assertCredentialOrigin(page, auth);
    password = await firstVisibleLocator(page, [
      auth.passwordSelector,
      'input[autocomplete="current-password"]',
      'input[type="password"]',
    ]);
  }

  if (!password) throw new Error("Login form password field was not detected after the username step. MFA/SSO pages may require Session Cookie mode.");
  await password.fill(auth.password);
  await submitLoginStep(page, auth.submitSelector);
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(auth.waitAfterMs);

  if (auth.successSelector) {
    try {
      await page.locator(auth.successSelector).first().waitFor({ state:"visible", timeout:8_000 });
    } catch {
      throw new Error("Login completed but the configured success selector was not found.");
    }
  }

  const response = await gotoReference(page, targetUrl);
  if ([401,403].includes(Number(response?.status?.()))) {
    throw new Error("Authentication was rejected by the reference website.");
  }

  const visiblePasswords = await page.locator('input[type="password"]:visible').count().catch(() => 0);
  const currentUrl = new URL(page.url());
  const target = new URL(targetUrl);
  const returnedToTarget = currentUrl.origin === target.origin && currentUrl.pathname === target.pathname;
  if (visiblePasswords > 0 && !returnedToTarget) {
    throw new Error("Login did not complete. Check credentials/selectors, or use Session Cookie mode for MFA/SSO.");
  }
}

async function establishReferenceSession(page, targetUrl, auth) {
  if (auth.mode === "cookie") {
    await page.context().addCookies(parseCookieHeader(auth.cookieHeader, targetUrl));
    const response = await gotoReference(page, targetUrl);
    if ([401,403].includes(Number(response?.status?.()))) throw new Error("Session cookie was rejected by the reference website.");
    return;
  }
  if (auth.mode === "login") {
    await performFormLogin(page, auth, targetUrl);
    return;
  }
  const response = await gotoReference(page, targetUrl);
  if (["header","basic"].includes(auth.mode) && [401,403].includes(Number(response?.status?.()))) {
    throw new Error("Authentication was rejected by the reference website.");
  }
}

export async function captureReferencePreview({ url, viewport = "desktop", auth = {} }) {
  const safeUrl = await assertPublicReferenceUrl(url);
  const requested = VIEWPORTS.find(x => x.name === String(viewport || "desktop").toLowerCase());
  if (!requested) throw new Error("Preview viewport must be desktop, tablet, or mobile.");
  const normalizedAuth = normalizeReferenceAuth(auth, safeUrl);
  const authSummary = referenceAuthSummary(normalizedAuth);
  const browser = await connectBrowser();
  try {
    const page = await pageForBrowser(browser, normalizedAuth, safeUrl);
    await setExactViewport(page, requested);
    await establishReferenceSession(page, safeUrl, normalizedAuth);
    const observed = await setExactViewport(page, requested);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    const shot = await page.screenshot({
      type: "jpeg",
      quality: 68,
      clip: { x:0, y:0, width:requested.width, height:requested.height },
    });
    const result = {
      schema: "kk-reference-preview/v1",
      url: safeUrl,
      finalUrl: page.url(),
      viewport: requested.name,
      width: observed.width,
      height: observed.height,
      screenshot: `data:image/jpeg;base64,${shot.toString("base64")}`,
      authentication: authSummary,
    };
    if (containsReferenceAuthSecret(result, normalizedAuth)) throw new Error("Authentication secret safety check failed.");
    return result;
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function inspectProjectWebsite({ url, auth = {} }) {
  const safeUrl = await assertPublicReferenceUrl(url);
  const normalizedAuth = normalizeReferenceAuth(auth, safeUrl);
  const authSummary = referenceAuthSummary(normalizedAuth);
  const browser = await connectBrowser();
  try {
    const page = await pageForBrowser(browser, normalizedAuth, safeUrl);
    await setExactViewport(page, VIEWPORTS[0]);
    await establishReferenceSession(page, safeUrl, normalizedAuth);
    await setExactViewport(page, VIEWPORTS[0]);
    const evidence = await page.evaluate(() => {
      const clean=(v,n=300)=>String(v||"").replace(/\s+/g," ").trim().slice(0,n);
      const visible=el=>{
        const s=getComputedStyle(el),r=el.getBoundingClientRect();
        return s.display!=="none"&&s.visibility!=="hidden"&&Number(s.opacity)>0.001&&r.width>1&&r.height>1;
      };
      const texts=(selector,limit=100)=>[...document.querySelectorAll(selector)].filter(visible).map(el=>clean(el.innerText||el.textContent)).filter(Boolean).slice(0,limit);
      const navItems=[...document.querySelectorAll("header a,nav a,[role='navigation'] a")].filter(visible).map(el=>clean(el.textContent,100)).filter(Boolean);
      const buttons=[...document.querySelectorAll("button,[role='button'],input[type='submit'],input[type='button']")].filter(visible).map(el=>clean(el.innerText||el.value||el.getAttribute("aria-label"),120)).filter(Boolean);
      const images=[...document.images].filter(visible).slice(0,160).map(img=>{
        const r=img.getBoundingClientRect();
        return{src:String(img.currentSrc||img.src||"").startsWith("data:")?"data:[inline-asset-omitted]":String(img.currentSrc||img.src||""),alt:clean(img.alt,180),naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,width:r.width,height:r.height};
      });
      const links=[...document.querySelectorAll("a[href]")].filter(visible).slice(0,220).map(a=>({text:clean(a.textContent,120),href:a.href}));
      const inputs=[...document.querySelectorAll("input,textarea,select")].filter(visible).slice(0,120).map(el=>({tag:el.tagName.toLowerCase(),type:el.getAttribute("type"),name:el.getAttribute("name"),placeholder:clean(el.getAttribute("placeholder"),160),ariaLabel:clean(el.getAttribute("aria-label"),160)}));
      const root=getComputedStyle(document.documentElement),body=getComputedStyle(document.body);
      const cssVars={};
      for(let i=0;i<root.length;i++){const k=root[i];if(k.startsWith("--")&&Object.keys(cssVars).length<240)cssVars[k]=root.getPropertyValue(k).trim();}
      return{
        title:document.title,
        description:document.querySelector('meta[name="description"]')?.content||"",
        lang:document.documentElement.lang||"",
        url:location.href,
        headings:texts("h1,h2,h3,h4,h5,h6",120),
        paragraphs:texts("main p,article p,section p",120),
        navItems:[...new Set(navItems)].slice(0,60),
        buttons:[...new Set(buttons)].slice(0,80),
        links,
        inputs,
        images,
        tokens:{rootBackground:root.backgroundColor,bodyBackground:body.backgroundColor,color:body.color,fontFamily:body.fontFamily,fontSize:body.fontSize,cssVars},
        signals:{next:Boolean(document.querySelector("#__NEXT_DATA__")||document.querySelector('script[src*="_next"]')),react:Boolean(document.querySelector("[data-reactroot]")||document.querySelector('script[src*="react"]')),forms:document.forms.length},
      };
    });
    const shot=await page.screenshot({type:"jpeg",quality:58,clip:{x:0,y:0,width:1440,height:900}});
    const result={
      schema:"kk-project-website-scan/v1",
      ...evidence,
      screenshot:`data:image/jpeg;base64,${shot.toString("base64")}`,
      authentication:authSummary,
    };
    if (containsReferenceAuthSecret(result, normalizedAuth)) throw new Error("Authentication secret safety check failed.");
    return result;
  } finally {
    await browser.close().catch(()=>{});
  }
}

function edgeMismatchPercent(a,b){
  const width=a.width,height=a.height,step=3,threshold=34;
  let diff=0,total=0;
  const lum=(png,x,y)=>{
    const i=(y*width+x)*4;
    return png.data[i]*0.2126+png.data[i+1]*0.7152+png.data[i+2]*0.0722;
  };
  for(let y=0;y<height-step;y+=step){
    for(let x=0;x<width-step;x+=step){
      const ea=Math.abs(lum(a,x+step,y)-lum(a,x,y))+Math.abs(lum(a,x,y+step)-lum(a,x,y));
      const eb=Math.abs(lum(b,x+step,y)-lum(b,x,y))+Math.abs(lum(b,x,y+step)-lum(b,x,y));
      const aa=ea>threshold,bb=eb>threshold;
      if(aa!==bb)diff++;
      total++;
    }
  }
  return total?Math.round((diff/total)*10000)/100:0;
}

export async function certifyGeneratedPreview({ url, html, viewport = "desktop", auth = {}, baseUrl = "" }) {
  const safeUrl = await assertPublicReferenceUrl(url);
  const requested = VIEWPORTS.find(x => x.name === String(viewport || "desktop").toLowerCase());
  if (!requested) throw new Error("Certification viewport must be desktop, tablet, or mobile.");
  const sourceHtml=String(html||"");
  if(!sourceHtml.trim() || sourceHtml.length>1_500_000) throw new Error("Generated preview HTML is missing or too large for visual certification.");
  const normalizedAuth = normalizeReferenceAuth(auth, safeUrl);
  const browser=await connectBrowser();
  try{
    const refPage=await pageForBrowser(browser,normalizedAuth,safeUrl);
    await setExactViewport(refPage,requested);
    await establishReferenceSession(refPage,safeUrl,normalizedAuth);
    await setExactViewport(refPage,requested);
    await refPage.evaluate(()=>window.scrollTo(0,0));
    const referencePng=await refPage.screenshot({type:"png",clip:{x:0,y:0,width:requested.width,height:requested.height}});

    const context=refPage.context();
    const buildPage=await context.newPage();
    buildPage.setDefaultTimeout(12_000);
    await installNetworkGuard(buildPage);
    await setExactViewport(buildPage,requested);
    let htmlWithBase=sourceHtml;
    if(baseUrl){
      const safeBase=await assertPublicReferenceUrl(baseUrl);
      htmlWithBase=sourceHtml.replace(/<head([^>]*)>/i,`<head$1><base href="${safeBase.replace(/"/g,"&quot;")}">`);
    }
    await buildPage.setContent(htmlWithBase,{waitUntil:"domcontentloaded",timeout:30_000});
    await buildPage.waitForLoadState("networkidle",{timeout:3_000}).catch(()=>{});
    await setExactViewport(buildPage,requested);
    await buildPage.evaluate(()=>window.scrollTo(0,0));
    const buildPng=await buildPage.screenshot({type:"png",clip:{x:0,y:0,width:requested.width,height:requested.height}});

    const a=PNG.sync.read(referencePng),b=PNG.sync.read(buildPng);
    const diff=new PNG({width:a.width,height:a.height});
    const mismatched=pixelmatch(a.data,b.data,diff.data,a.width,a.height,{threshold:0.12,includeAA:false});
    const total=a.width*a.height;
    const rawPixelMismatchPct=Math.round((mismatched/total)*10000)/100;
    const edgeMismatchPct=edgeMismatchPercent(a,b);
    const diffPng=PNG.sync.write(diff,{colorType:6});
    const buildJpeg=await buildPage.screenshot({type:"jpeg",quality:64,clip:{x:0,y:0,width:requested.width,height:requested.height}});
    return{
      schema:"kk-visual-certification/v1",
      viewport:requested.name,
      width:requested.width,
      height:requested.height,
      metrics:{
        rawPixelMismatchPct,
        rawPixelSimilarityPct:Math.round((100-rawPixelMismatchPct)*100)/100,
        edgeMismatchPct,
        structuralSimilarityPct:Math.round((100-edgeMismatchPct)*100)/100,
        note:"Raw pixel similarity is content-sensitive. Structural similarity compares edge placement and is less sensitive to color/content changes."
      },
      buildScreenshot:`data:image/jpeg;base64,${buildJpeg.toString("base64")}`,
      diffScreenshot:`data:image/png;base64,${diffPng.toString("base64")}`,
    };
  } finally {
    await browser.close().catch(()=>{});
  }
}

const candidateScript = () => {
  function selectorFor(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return "#" + CSS.escape(el.id);
    for (const attr of ["data-testid", "data-test", "data-qa"]) {
      const v = el.getAttribute(attr);
      if (v) return el.tagName.toLowerCase() + "[" + attr + "=\"" + CSS.escape(v) + "\"]";
    }
    const cls = typeof el.className === "string"
      ? el.className.trim().split(/\s+/).filter(x => /^[A-Za-z_-][\w-]*$/.test(x)).slice(0,2)
      : [];
    if (cls.length) {
      const q = el.tagName.toLowerCase() + cls.map(x => "." + CSS.escape(x)).join("");
      try { if (document.querySelectorAll(q).length === 1) return q; } catch {}
    }
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter(x => x.tagName === node.tagName);
        if (same.length > 1) part += ":nth-of-type(" + (same.indexOf(node) + 1) + ")";
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
  function clean(v, max = 100) {
    const text = String(v || "").replace(/\s+/g, " ").trim();
    if (!text || /requestAnimationFrame|function\s*\(/i.test(text)) return "";
    return text.slice(0, max);
  }
  function labelFor(el) {
    const explicit = el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("name");
    if (clean(explicit)) return clean(explicit);
    const heading = el.matches("h1,h2,h3,h4,h5,h6") ? el : el.querySelector?.("h1,h2,h3,h4,h5,h6");
    if (clean(heading?.textContent)) return clean(heading.textContent);
    if (el.matches("button,a,label,summary,[role='button'],[role='tab']") && clean(el.textContent)) return clean(el.textContent);
    const alt = el.getAttribute("alt");
    if (clean(alt)) return clean(alt);
    return el.tagName.toLowerCase();
  }
  function transitionActive(s) {
    return Boolean(s.transitionDuration && s.transitionDuration.split(",").some(v => parseFloat(v) > 0));
  }
  function animationActive(s) {
    return Boolean(s.animationName && s.animationName !== "none");
  }
  function visualSurface(el, s, r) {
    if (r.width < 80 || r.height < 36 || r.width * r.height < 5000) return false;
    const classText = typeof el.className === "string" ? el.className.toLowerCase() : "";
    if (/card|tile|panel|surface|feature|pricing|testimonial|gallery|carousel|grid|list|hero|banner|cta|badge|chip|avatar|logo|player/.test(classText)) return true;
    const rounded = parseFloat(s.borderRadius) >= 6;
    const shadowed = s.boxShadow && s.boxShadow !== "none";
    const bordered = s.borderStyle && s.borderStyle !== "none" && parseFloat(s.borderWidth) > 0;
    const painted = s.backgroundColor && !/rgba?\(0,\s*0,\s*0,\s*0\)/.test(s.backgroundColor);
    return el.children.length >= 2 && (shadowed || (rounded && painted) || (bordered && painted));
  }

  function detectReferenceIntent() {
    const pathname=location.pathname.toLowerCase();
    const pathSignal=/(^|\/)(tags?|search|discover|explore|gallery|collections?|templates?|inspiration)(\/|$)/i.test(pathname);
    const cardSelector="article,[class*='shot' i],[class*='card' i],[class*='tile' i],[class*='gallery' i],[class*='grid-item' i],[class*='result' i]";
    const visible=el=>{
      const s=getComputedStyle(el),r=el.getBoundingClientRect();
      return s.display!=="none"&&s.visibility!=="hidden"&&Number(s.opacity||1)>0.001&&r.width>4&&r.height>4;
    };
    const items=[];
    const seenHref=new Set();
    for(const a of document.querySelectorAll("a[href]")){
      if(items.length>=80)break;
      if(!visible(a))continue;
      let parsed;
      try{parsed=new URL(a.href,location.href)}catch{continue}
      if(!/^https?:$/.test(parsed.protocol))continue;
      if(parsed.href===location.href || seenHref.has(parsed.href))continue;
      const text=clean(a.getAttribute("aria-label")||a.getAttribute("title")||a.textContent,160);
      const card=a.closest(cardSelector);
      const img=a.querySelector("img") || card?.querySelector("img");
      const sameOrigin=parsed.origin===location.origin;
      if(!sameOrigin)continue;
      let score=0;
      if(card)score+=24;
      if(img)score+=20;
      if(/^view\s+/i.test(text))score+=18;
      if(/\/(shots?|designs?|projects?|templates?)\//i.test(parsed.pathname))score+=35;
      if(sameOrigin)score+=10;
      if(text.length>=4)score+=8;
      if(score<28)continue;
      seenHref.add(parsed.href);
      items.push({
        label:(text||clean(img?.alt,160)||parsed.pathname.split("/").filter(Boolean).pop()||"Design item").replace(/^View\s+/i,"").slice(0,160),
        url:parsed.href,
        image:"",
        score,
      });
    }
    items.sort((a,b)=>b.score-a.score);
    const top=items.slice(0,16);
    const repeatedCardCount=[...document.querySelectorAll(cardSelector)].filter(visible).length;
    const collection=(pathSignal && top.length>=3) || top.length>=8 || repeatedCardCount>=10;
    const reasons=[];
    if(pathSignal)reasons.push("URL path looks like a collection, search, discovery, gallery, or tag page.");
    if(repeatedCardCount>=6)reasons.push(`${repeatedCardCount} repeated card/tile surfaces were detected.`);
    if(top.length>=3)reasons.push(`${top.length} likely design-item links were detected.`);
    return {
      kind:collection?"collection":"single-page",
      confidence:collection ? (pathSignal && top.length>=6 ? "high" : "medium") : "medium",
      requiresChoice:collection,
      reasons,
      itemCount:top.length,
      items:top,
    };
  }

  const explicitSelector = [
    "header","nav","main","aside","footer","section","form","dialog",
    "h1","h2","h3","button","input","textarea","select","picture","img","video","svg",
    "[role='banner']","[role='navigation']","[role='main']","[role='complementary']","[role='dialog']",
    "[role='button']","[role='tab']","[role='tablist']","[role='list']","[role='search']","[role='combobox']",
    "[class*='sidebar' i]","[class*='workspace' i]","[class*='dashboard' i]","[class*='hero' i]",
    "[class*='header' i]","[class*='footer' i]","[class*='nav' i]","[class*='modal' i]","[class*='drawer' i]",
    "[class*='card' i]","[class*='tile' i]","[class*='panel' i]","[class*='pricing' i]","[class*='feature' i]",
    "[class*='testimonial' i]","[class*='gallery' i]","[class*='carousel' i]","[class*='slider' i]",
    "[class*='grid' i]","[class*='list' i]","[class*='cta' i]","[class*='button' i]","[class*='badge' i]",
    "[class*='chip' i]","[class*='tabs' i]","[class*='search' i]","[class*='logo' i]","[class*='avatar' i]",
    "[class*='image' i]","[class*='video' i]","[class*='player' i]"
  ].join(",");
  const explicit = [...document.querySelectorAll(explicitSelector)];
  const visual = [...document.querySelectorAll("body *")].filter(el => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return visualSurface(el, s, r);
  }).slice(0, 180);
  const motion = [...document.querySelectorAll("body *")].filter(el => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const interactive = el.matches("a,button,input,select,textarea,summary,[role='button'],[role='link'],[role='tab'],[tabindex]");
    return animationActive(s) || (transitionActive(s) && interactive && r.width >= 16 && r.height >= 12);
  }).slice(0, 100);

  const seen = new Set();
  const rows = [];
  for (const el of [...explicit, ...visual, ...motion]) {
    const rect = absoluteRect(el);
    if (rect.width < 12 || rect.height < 10 || rect.y < -20) continue;
    const selector = selectorFor(el);
    if (!selector || seen.has(selector)) continue;
    seen.add(selector);
    const s = getComputedStyle(el);
    const className = typeof el.className === "string" ? el.className.slice(0, 220) : "";
    const interactive = el.matches("a,button,input,select,textarea,summary,[role='button'],[role='link'],[role='tab'],[tabindex]");
    const animation = animationActive(s) || transitionActive(s);
    const visibleText = clean(el.textContent, 120);
    const score =
      (["HEADER","NAV","MAIN","ASIDE","FOOTER","SECTION","FORM","DIALOG"].includes(el.tagName) ? 40 : 0) +
      (interactive ? 28 : 0) +
      (visualSurface(el, s, el.getBoundingClientRect()) ? 24 : 0) +
      (animationActive(s) ? 16 : 0) +
      (/^H[1-3]$/.test(el.tagName) ? 20 : 0) +
      (["IMG","VIDEO","PICTURE","SVG"].includes(el.tagName) ? 18 : 0) +
      Math.min(20, Math.round(Math.log10(Math.max(100, rect.width * rect.height)) * 4));
    rows.push({
      selector,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role"),
      className,
      label: labelFor(el),
      textPreview: visibleText,
      rect,
      animation,
      interactive,
      sticky: ["fixed","sticky"].includes(s.position),
      score,
      styleHint: {
        display: s.display,
        position: s.position,
        backgroundColor: s.backgroundColor,
        borderRadius: s.borderRadius,
        boxShadow: s.boxShadow,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
      }
    });
    if (rows.length >= 360) break;
  }
  rows.sort((a,b) => b.score - a.score || a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  return {
    title: document.title,
    finalUrl: location.href,
    document: {
      width: Math.max(document.documentElement.scrollWidth, innerWidth),
      height: Math.max(document.documentElement.scrollHeight, innerHeight)
    },
    intent:detectReferenceIntent(),
    rows,
  };
};
export async function inspectReferenceDesign({ url, auth = {} }) {
  const safeUrl = await assertPublicReferenceUrl(url);
  const normalizedAuth = normalizeReferenceAuth(auth, safeUrl);
  const authSummary = referenceAuthSummary(normalizedAuth);
  const browser = await connectBrowser();
  try {
    const page = await pageForBrowser(browser, normalizedAuth, safeUrl);
    await setExactViewport(page, VIEWPORTS[0]);
    await establishReferenceSession(page, safeUrl, normalizedAuth);
    await setExactViewport(page, VIEWPORTS[0]);
    const info = await page.evaluate(candidateScript);
    const maxHeight = Math.min(Math.max(info.document.height, 900), 12_000);
    const shot = await page.screenshot({ type: "jpeg", quality: 58, clip: { x: 0, y: 0, width: 1440, height: maxHeight } });
    const candidates = info.rows.filter(x => x.rect.y < maxHeight).map((row, index) => {
      const kind = classifyCandidate(row);
      return {
        id: `ref-${index + 1}`,
        ...row,
        kind,
        family: candidateFamily(kind),
      };
    });
    const familyCounts = {};
    const kindCounts = {};
    for (const candidate of candidates) {
      familyCounts[candidate.family] = (familyCounts[candidate.family] || 0) + 1;
      kindCounts[candidate.kind] = (kindCounts[candidate.kind] || 0) + 1;
    }
    const result = {
      schema: "kk-reference-design-inspection/v2",
      url: safeUrl,
      finalUrl: info.finalUrl,
      title: info.title,
      screenshot: `data:image/jpeg;base64,${shot.toString("base64")}`,
      screenshotWidth: 1440,
      screenshotHeight: maxHeight,
      candidates,
      candidateCount: candidates.length,
      facets: { familyCounts, kindCounts },
      intent: info.intent || {kind:"single-page",confidence:"low",requiresChoice:false,reasons:[],itemCount:0,items:[]},
      authentication: authSummary,
    };
    if (containsReferenceAuthSecret(result, normalizedAuth)) throw new Error("Authentication secret safety check failed.");
    return result;
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
    return {
      content: compactCssValue(s.content),
      display:s.display, position:s.position, top:s.top, right:s.right, bottom:s.bottom, left:s.left,
      color:s.color, backgroundColor:s.backgroundColor, backgroundImage:compactCssValue(s.backgroundImage),
      width:s.width, height:s.height, opacity:s.opacity, border:s.border, borderRadius:s.borderRadius,
      fontFamily:s.fontFamily, fontSize:s.fontSize, fontWeight:s.fontWeight, lineHeight:s.lineHeight,
      transform:s.transform, transformOrigin:s.transformOrigin, zIndex:s.zIndex, pointerEvents:s.pointerEvents
    };
  }
  function safeSvgMarkup(el) {
    if (el?.tagName?.toLowerCase() !== "svg") return "";
    const clone=el.cloneNode(true);
    clone.querySelectorAll("script,foreignObject").forEach(node=>node.remove());
    for(const node of [clone,...clone.querySelectorAll("*")]){
      for(const attr of [...node.attributes]){
        const name=attr.name.toLowerCase(), value=String(attr.value||"").trim();
        if(name.startsWith("on"))node.removeAttribute(attr.name);
        else if(["href","xlink:href"].includes(name) && /^\s*javascript:/i.test(value))node.removeAttribute(attr.name);
      }
    }
    return clone.outerHTML.slice(0,16000);
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
    const semanticallyUseful = interactive || /^h[1-6]$/.test(el.tagName.toLowerCase()) || ["header","nav","main","aside","footer","section","article","form","dialog","img","picture","source","svg","video","p","ul","ol","li"].includes(el.tagName.toLowerCase()) || s.position === "fixed" || s.position === "sticky" || s.animationName !== "none" || parseFloat(s.transitionDuration) > 0;
    // Keep measured wrappers in the raw snapshot. The compact-evidence stage
    // later retains only useful nodes plus their required ancestors.
    void semanticallyUseful;
    const ancestors=[]; let parent=el.parentElement; let depth=0;
    while(parent && depth<8){ const q=selectorFor(parent); if(q)ancestors.push(q); parent=parent.parentElement; depth++; }
    const parentSelector=selectorFor(el.parentElement);
    const childIndex=el.parentElement ? [...el.parentElement.children].indexOf(el) : 0;
    elements.push({
      selector,
      parentSelector,
      ancestorSelectors:ancestors,
      childIndex,
      depth:ancestors.length,
      tag: el.tagName.toLowerCase(),
      role: role(el),
      className: typeof el.className === "string" ? el.className.slice(0,220) : "",
      label: label(el),
      text: (el.textContent || "").replace(/\s+/g," ").trim().slice(0,420),
      interactive,
      rect: r,
      style: s,
      attrs: {
        id: el.id || null,
        href: el.getAttribute("href"),
        src: compactCssValue(el.currentSrc || el.getAttribute("src") || ""),
        srcset: compactCssValue(el.getAttribute("srcset") || ""),
        sizes: el.getAttribute("sizes"),
        alt: el.getAttribute("alt"),
        title: el.getAttribute("title"),
        placeholder: el.getAttribute("placeholder"),
        type: el.getAttribute("type"),
        width: el.getAttribute("width"),
        height: el.getAttribute("height"),
        loading: el.getAttribute("loading"),
        poster: compactCssValue(el.getAttribute("poster") || ""),
        autoplay: el.hasAttribute("autoplay"),
        loop: el.hasAttribute("loop"),
        muted: el.hasAttribute("muted"),
        controls: el.hasAttribute("controls"),
        playsinline: el.hasAttribute("playsinline"),
        ariaExpanded: el.getAttribute("aria-expanded"),
        ariaSelected: el.getAttribute("aria-selected"),
        ariaChecked: el.getAttribute("aria-checked"),
        ariaDisabled: el.getAttribute("aria-disabled")
      },
      markup: safeSvgMarkup(el) || undefined,
      pseudoBefore: pseudo(el,"::before"),
      pseudoAfter: pseudo(el,"::after")
    });
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
  const media = new Set(), containers = new Set(), fontFaces = new Set();
  const styleSheets = { total: document.styleSheets.length, readable: 0, blocked: 0 };
  function walkRules(rules) {
    for (const rule of rules || []) {
      try {
        if (rule.constructor?.name === "CSSMediaRule") media.add(rule.conditionText || rule.media?.mediaText || "");
        if (rule.constructor?.name === "CSSContainerRule") containers.add(rule.conditionText || "");
        if (rule.constructor?.name === "CSSFontFaceRule" && rule.cssText) fontFaces.add(String(rule.cssText).slice(0,12000));
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
  function safeSvgMarkup(el){
    const clone=el.cloneNode(true);
    clone.querySelectorAll("script,foreignObject").forEach(node=>node.remove());
    for(const node of [clone,...clone.querySelectorAll("*")]){
      for(const attr of [...node.attributes]){
        const name=attr.name.toLowerCase(),value=String(attr.value||"").trim();
        if(name.startsWith("on"))node.removeAttribute(attr.name);
        else if(["href","xlink:href"].includes(name)&&/^\s*javascript:/i.test(value))node.removeAttribute(attr.name);
      }
    }
    return clone.outerHTML.slice(0,16000);
  }
  const svgs=[...document.querySelectorAll("svg")].slice(0,100).map(el=>({selector:selectorFor(el),className:typeof el.className?.baseVal==="string"?el.className.baseVal:"",viewBox:el.getAttribute("viewBox"),width:el.getAttribute("width"),height:el.getAttribute("height"),fill:el.getAttribute("fill"),stroke:el.getAttribute("stroke"),markup:safeSvgMarkup(el)}));
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
    fontFaces:[...fontFaces].slice(0,80),
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

function normalizeSelection(scope, selectors, selection = []) {
  if (scope === "whole") {
    return { scope: "whole", selectors: ["body"], selection: [{ label: "Whole Page", selector: "body", kind: "Page", family: "Structure" }] };
  }
  const clean = [...new Set((selectors || []).map(String).map(x => x.trim()).filter(Boolean))];
  if (!clean.length) throw new Error("Select at least one reference design region.");
  if (clean.length > 30) throw new Error("Custom design selection supports up to 30 regions. Refine the selection or use Whole page.");
  const metadata = new Map((selection || []).filter(x => x?.selector).map(x => [String(x.selector), x]));
  return {
    scope: "selected",
    selectors: clean,
    selection: clean.map(selector => {
      const row = metadata.get(selector) || {};
      return {
        selector,
        label: String(row.label || selector).slice(0, 180),
        kind: String(row.kind || "Selected").slice(0, 60),
        family: String(row.family || "Components").slice(0, 60),
      };
    }),
  };
}

export async function generateReferenceDesignMd({ url, scope = "whole", selectors = [], selection = [], auth = {} }) {
  const safeUrl = await assertPublicReferenceUrl(url);
  const normalizedAuth = normalizeReferenceAuth(auth, safeUrl);
  const authSummary = referenceAuthSummary(normalizedAuth);
  const chosen = normalizeSelection(scope, selectors, selection);
  const browser = await connectBrowser();
  try {
    const page = await pageForBrowser(browser, normalizedAuth, safeUrl);
    const responsive = [];
    let title = "";
    let finalUrl = safeUrl;
    let pageEvidence = null;

    await setExactViewport(page, VIEWPORTS[0]);
    await establishReferenceSession(page, safeUrl, normalizedAuth);

    for (const viewport of VIEWPORTS) {
      await setExactViewport(page, viewport);
      await gotoReference(page, safeUrl);
      const observedViewport = await setExactViewport(page, viewport);
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
    await setExactViewport(page, VIEWPORTS[0]);
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
      "Only states safely observable without destructive actions or defeating bot/CAPTCHA/MFA protections are measured. Authentication is used only when the user explicitly supplies it for the capture.",
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
      authentication: authSummary,
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
    const evidenceJson = JSON.stringify(buildEvidenceCompanion(evidence), null, 2);
    const responseBytes = Buffer.byteLength(markdown, "utf8") + Buffer.byteLength(evidenceJson, "utf8");
    if (responseBytes > 4_000_000) {
      throw new Error("Generated reference evidence exceeds the safe web response budget. Select a smaller reference region and retry.");
    }
    const result = {
      schema: "kk-reference-design-md/v2",
      filename: "DESIGN.md",
      markdown,
      evidenceFilename: "DESIGN-EVIDENCE.json",
      evidenceJson,
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
        responseBytes,
        authentication: authSummary,
      },
    };
    if (containsReferenceAuthSecret(result, normalizedAuth)) throw new Error("Authentication secret safety check failed.");
    return result;
  } finally {
    await browser.close().catch(() => {});
  }
}
