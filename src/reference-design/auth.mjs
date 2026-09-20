const MODES = new Set(["public","login","cookie","header","basic"]);

function clean(value, max, label) {
  const text = String(value ?? "").trim();
  if (text.length > max) throw new Error(`${label} is too long.`);
  return text;
}

function safeWebUrl(value, label) {
  const text = clean(value, 4096, label);
  if (!text) return "";
  let url;
  try { url = new URL(text); } catch { throw new Error(`${label} must be a valid http(s) URL.`); }
  if (!["http:","https:"].includes(url.protocol)) throw new Error(`${label} must use http(s).`);
  if (url.username || url.password) throw new Error(`${label} must not contain credentials in the URL.`);
  url.hash = "";
  return url.toString();
}

function selector(value, label) {
  const text = clean(value, 300, label);
  if (/[\r\n]/.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function secret(value, label, max = 16384) {
  const text = String(value ?? "");
  if (!text) throw new Error(`${label} is required.`);
  if (text.length > max) throw new Error(`${label} is too long.`);
  return text;
}

export function normalizeReferenceAuth(input = {}, targetUrl = "") {
  const rawMode = String(input?.mode || "public").trim().toLowerCase();
  const mode = rawMode === "form" ? "login" : rawMode;
  if (!MODES.has(mode)) throw new Error("Unsupported authentication mode.");

  const target = safeWebUrl(targetUrl, "Reference URL");
  if (mode === "public") return { mode:"public" };

  if (mode === "login") {
    return {
      mode,
      loginUrl: safeWebUrl(input.loginUrl || target, "Login URL"),
      username: secret(input.username, "Username", 2048),
      password: secret(input.password, "Password", 4096),
      usernameSelector: selector(input.usernameSelector, "Username selector"),
      passwordSelector: selector(input.passwordSelector, "Password selector"),
      submitSelector: selector(input.submitSelector, "Submit selector"),
      successSelector: selector(input.successSelector, "Success selector"),
      waitAfterMs: Math.min(5000, Math.max(250, Number(input.waitAfterMs) || 900)),
    };
  }

  if (mode === "cookie") {
    return {
      mode,
      cookieHeader: secret(input.cookieHeader, "Session cookie", 16384),
    };
  }

  if (mode === "basic") {
    return {
      mode,
      username: secret(input.username, "Username", 2048),
      password: secret(input.password, "Password", 4096),
    };
  }

  const headerName = clean(input.headerName || "Authorization", 120, "Header name");
  const lower = headerName.toLowerCase();
  const forbidden = new Set([
    "host","connection","content-length","transfer-encoding","proxy-authorization",
    "cookie","set-cookie","x-vercel-protection-bypass"
  ]);
  if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(headerName) || forbidden.has(lower)) {
    throw new Error("That authentication header name is not allowed.");
  }
  return {
    mode,
    headerName,
    headerValue: secret(input.headerValue, "Header value", 16384),
  };
}

export function referenceAuthSummary(auth = {}) {
  const mode = MODES.has(auth?.mode) ? auth.mode : "public";
  if (mode === "public") return { mode, authenticated:false };
  if (mode === "login") {
    return {
      mode,
      authenticated:true,
      method:"form-login",
      customSelectors:Boolean(auth.usernameSelector || auth.passwordSelector || auth.submitSelector || auth.successSelector),
    };
  }
  if (mode === "cookie") return { mode, authenticated:true, method:"session-cookie" };
  if (mode === "basic") return { mode, authenticated:true, method:"http-basic" };
  return { mode, authenticated:true, method:"request-header", headerName:auth.headerName };
}

export function parseCookieHeader(cookieHeader, targetUrl) {
  const url = new URL(targetUrl);
  const pairs = String(cookieHeader || "").split(";").map(x=>x.trim()).filter(Boolean);
  const cookies=[];
  for (const pair of pairs) {
    const i=pair.indexOf("=");
    if (i <= 0) continue;
    const name=pair.slice(0,i).trim();
    const value=pair.slice(i+1).trim();
    if (!name || /[\s;,]/.test(name)) continue;
    cookies.push({ name, value, url:url.origin });
  }
  if (!cookies.length) throw new Error("Session cookie did not contain any valid name=value pairs.");
  return cookies;
}

export function referenceAuthHeader(auth = {}) {
  if (auth.mode === "basic") {
    const token = Buffer.from(`${auth.username}:${auth.password}`, "utf8").toString("base64");
    return { name:"Authorization", value:`Basic ${token}` };
  }
  if (auth.mode === "header") return { name:auth.headerName, value:auth.headerValue };
  return null;
}

export function containsReferenceAuthSecret(value, auth = {}) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? {});
  const secrets = [auth.password,auth.cookieHeader,auth.headerValue]
    .filter(Boolean)
    .map(String)
    .filter(x=>x.length>=3);
  return secrets.some(secret=>text.includes(secret));
}
