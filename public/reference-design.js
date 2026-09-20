const $ = id => document.getElementById(id);
const MAX_CUSTOM_SELECTION = 30;
const FAMILY_ORDER = ["All", "Structure", "Controls", "Content", "Media", "Motion", "Components"];
const state = {
  inspection: null,
  selected: new Set(),
  activeFamily: "All",
  markdown: "",
  filename: "DESIGN.md",
  evidenceJson: "",
  evidenceFilename: "DESIGN-EVIDENCE.json",
  build: null,
  projectFiles: [],
  projectProfile: null,
  referencePreviews: {},
  githubScan: null,
  websiteEvidence: null,
  certifications: {},
  currentDevice: "desktop",
  previewScaleMode: "fit",
};

function notice(message, kind = "error") {
  const el = $("notice");
  el.hidden = !message;
  el.textContent = message || "";
  el.dataset.kind = kind;
}
function busy(button, yes, label) {
  if (!button) return;
  if (yes) {
    button.dataset.label = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}
async function api(path, options = {}) {
  const response = await fetch(path, { cache:"no-store", credentials:"same-origin", headers: { "Content-Type": "application/json" }, ...options });
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}
function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, x => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[x]));
}
const AUTH_LABELS = {
  public:"Public",
  login:"Login form",
  cookie:"Session cookie",
  header:"Access token",
  basic:"HTTP Basic",
};
function authMode() {
  return $("authMode")?.value || "public";
}
function currentAuth() {
  const mode = authMode();
  if (mode === "public") return { mode };
  if (mode === "login") {
    return {
      mode,
      loginUrl: $("authLoginUrl").value.trim(),
      username: $("authUsername").value,
      password: $("authPassword").value,
      usernameSelector: $("authUsernameSelector").value.trim(),
      passwordSelector: $("authPasswordSelector").value.trim(),
      submitSelector: $("authSubmitSelector").value.trim(),
      successSelector: $("authSuccessSelector").value.trim(),
    };
  }
  if (mode === "cookie") return { mode, cookieHeader:$("authCookie").value };
  if (mode === "header") {
    return {
      mode,
      headerName:$("authHeaderName").value.trim() || "Authorization",
      headerValue:$("authHeaderValue").value,
    };
  }
  return {
    mode:"basic",
    username:$("authBasicUsername").value,
    password:$("authBasicPassword").value,
  };
}
function updateAuthUi() {
  const mode = authMode();
  $("authModeLabel").textContent = AUTH_LABELS[mode] || "Authentication";
  $("authLoginFields").hidden = mode !== "login";
  $("authCookieFields").hidden = mode !== "cookie";
  $("authHeaderFields").hidden = mode !== "header";
  $("authBasicFields").hidden = mode !== "basic";
  $("authPanel").classList.toggle("hasAuth", mode !== "public");
}
function setAuthPanel(open) {
  $("authPanel").hidden = !open;
  $("authToggle").setAttribute("aria-expanded", String(open));
}
function clearAuthSecrets() {
  for (const id of [
    "authLoginUrl","authUsername","authPassword","authUsernameSelector","authPasswordSelector",
    "authSubmitSelector","authSuccessSelector","authCookie","authHeaderValue","authBasicUsername","authBasicPassword"
  ]) {
    const el=$(id);
    if (el) el.value="";
  }
  $("authHeaderName").value="Authorization";
  $("authMode").value="public";
  updateAuthUi();
  setAuthPanel(false);
}

const PROJECT_TEXT_EXTENSIONS = new Set([
  ".json",".md",".txt",".html",".htm",".css",".scss",".sass",".less",
  ".js",".jsx",".mjs",".cjs",".ts",".tsx",".vue",".svelte",".yaml",".yml",".toml"
]);
const PROJECT_SKIP_PATH = /(^|\/)(node_modules|\.git|\.next|dist|build|coverage|\.cache|vendor)(\/|$)/i;
const PROJECT_SECRET_PATH = /(^|\/)(\.env(?:\.|$)|id_rsa|id_ed25519|.*\.(?:pem|key|p12|pfx)|credentials?(?:\.|$)|secrets?(?:\.|$))/i;
function fileExtension(name) {
  const base=String(name||"").toLowerCase();
  const i=base.lastIndexOf(".");
  return i>=0 ? base.slice(i) : "";
}
function projectFilePriority(file) {
  const path=(file.webkitRelativePath || file.name || "").replaceAll("\\","/").toLowerCase();
  let score=0;
  if(/(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|design[^/]*\.(?:md|json)|tailwind\.config|next\.config|vite\.config|tsconfig)/.test(path))score+=120;
  if(/(^|\/)(app|pages|src|components|ui|views|screens|styles|public|assets)(\/|$)/.test(path))score+=45;
  if(/\.(tsx|jsx|vue|svelte)$/.test(path))score+=45;
  if(/\.(css|scss|sass|less)$/.test(path))score+=35;
  if(/header|nav|sidebar|layout|home|hero|footer|form|card|theme|token|brand/.test(path))score+=25;
  if(PROJECT_SECRET_PATH.test(path)||PROJECT_SKIP_PATH.test(path))score-=1000;
  return score;
}
async function readProjectFiles(fileList) {
  const input=[...fileList].sort((a,b)=>projectFilePriority(b)-projectFilePriority(a));
  const seen=new Set();
  const rows=[];
  let textBudget=0;
  let binaryBudget=0;
  const isPortableAsset=name=>/\.(png|jpe?g|webp|avif|gif|svg|ico|mp4|webm|woff2?|ttf|otf)$/i.test(name);
  for (const file of input) {
    const path=(file.webkitRelativePath || file.name || "").replaceAll("\\","/");
    if (!path || seen.has(path) || PROJECT_SKIP_PATH.test(path) || PROJECT_SECRET_PATH.test(path)) continue;
    seen.add(path);
    const row={path,name:file.name,size:file.size,type:file.type||"",text:"",base64:""};
    const extension=fileExtension(file.name);
    if (PROJECT_TEXT_EXTENSIONS.has(extension) && file.size <= 300_000 && textBudget + file.size <= 1_500_000) {
      try {
        row.text=await file.text();
        textBudget += file.size;
      } catch {}
    } else if (isPortableAsset(file.name) && file.size <= 1_000_000 && binaryBudget + file.size <= 1_500_000) {
      try {
        const bytes=new Uint8Array(await file.arrayBuffer());
        let binary="";
        const chunk=0x8000;
        for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
        row.base64=btoa(binary);
        binaryBudget += file.size;
      } catch {}
    }
    rows.push(row);
    if (rows.length >= 500) break;
  }
  // webkitdirectory prefixes every file with the chosen folder name.
  // Remove only that browser-added wrapper so generated patch paths remain project-relative.
  const folderInputs=input.filter(file=>file.webkitRelativePath);
  if(folderInputs.length){
    const roots=[...new Set(folderInputs.map(file=>String(file.webkitRelativePath).replaceAll("\\","/").split("/")[0]).filter(Boolean))];
    if(roots.length===1){
      const prefix=roots[0]+"/";
      for(const row of rows){
        if(row.path.startsWith(prefix))row.path=row.path.slice(prefix.length);
      }
    }
  }
  return rows;
}
function projectMode() {
  return document.querySelector("input[name='projectMode']:checked")?.value || "existing";
}
function mergedProjectFiles() {
  const rows=[];
  const byPath=new Map();
  for (const file of state.githubScan?.files || []) {
    if(file?.path) byPath.set(file.path,file);
  }
  // Local files intentionally win over repository copies because they may contain newer work.
  for (const file of state.projectFiles || []) {
    if(file?.path) byPath.set(file.path,file);
  }
  for (const row of byPath.values()) rows.push(row);
  return rows.slice(0,500);
}
function collectProjectContext() {
  const files=projectMode()==="existing" ? mergedProjectFiles() : state.projectFiles;
  return {
    mode: projectMode(),
    projectName: $("fitProjectName").value.trim(),
    stack: $("fitStack").value,
    targetRoute: $("fitTargetRoute").value.trim(),
    targetPath: $("fitTargetPath").value.trim(),
    brand: $("fitBrand").value.trim(),
    navItems: $("fitNav").value.trim(),
    heroTitle: $("fitHeroTitle").value.trim(),
    heroBody: $("fitHeroBody").value.trim(),
    primaryCta: $("fitPrimaryCta").value.trim(),
    secondaryCta: $("fitSecondaryCta").value.trim(),
    logoAsset: $("fitLogoAsset").value.trim(),
    heroAsset: $("fitHeroAsset").value.trim(),
    files,
    websiteEvidence: state.websiteEvidence,
    githubEvidence: state.githubScan ? {
      schema:state.githubScan.schema,
      repository:state.githubScan.repository,
      coverage:state.githubScan.coverage,
    } : null,
    sourceSummary:{
      localFiles:state.projectFiles.length,
      githubFiles:state.githubScan?.files?.length || 0,
      website:Boolean(state.websiteEvidence),
    },
  };
}
function sourceCount() {
  return Number(state.projectFiles.length>0)+Number(Boolean(state.githubScan))+Number(Boolean(state.websiteEvidence));
}
function updateSourceSummary() {
  if($("sourceEvidenceScore")) $("sourceEvidenceScore").textContent=`${sourceCount()} source${sourceCount()===1?"":"s"}`;
}
function invalidateProjectFit() {
  state.projectProfile=null;
  $("projectFitScore").dataset.state="empty";
  $("projectFitScore").innerHTML="<b>—</b><span>Project fit</span>";
  $("projectFitResult").hidden=true;
  updateAccurateAvailability();
}
function updateAccurateAvailability() {
  const accurateOption=[...$("buildFidelity").options].find(x=>x.value==="accurate");
  const ready=Boolean(state.projectProfile?.readiness?.accurateReady);
  if (accurateOption) accurateOption.disabled=!ready;
  if (!ready && $("buildFidelity").value==="accurate") $("buildFidelity").value="balanced";
  $("projectFitHint").textContent=ready
    ? "Accurate mode unlocked — required project evidence is ready."
    : "Accurate mode stays locked until required project evidence is ready.";
  $("projectFitHint").dataset.ready=ready ? "true" : "false";
}
function renderProjectFit(profile) {
  state.projectProfile=profile;
  const score=Number(profile.readiness?.score||0);
  const scoreBox=$("projectFitScore");
  scoreBox.dataset.state=profile.readiness?.accurateReady ? "ready" : score>=50 ? "partial" : "low";
  scoreBox.innerHTML=`<b>${score}%</b><span>Project fit</span>`;
  $("projectFitResult").hidden=false;
  $("fitDetectedStack").textContent=profile.stack || "Unknown";
  $("fitDetectedPm").textContent=profile.packageManager || "—";
  $("fitDetectedStyling").textContent=(profile.styling||[]).join(", ") || "—";
  $("fitDetectedTarget").textContent=profile.targetPath || "—";
  if (!$("fitProjectName").value.trim() && profile.projectName) $("fitProjectName").value=profile.projectName;
  if (!$("fitTargetRoute").value.trim() && profile.targetRoute) $("fitTargetRoute").value=profile.targetRoute;
  if (!$("fitTargetPath").value.trim() && profile.targetPath) $("fitTargetPath").value=profile.targetPath;
  const pc=profile.content||{};
  if (!$("fitBrand").value.trim() && pc.brand) $("fitBrand").value=pc.brand;
  if (!$("fitHeroTitle").value.trim() && pc.heroTitle) $("fitHeroTitle").value=pc.heroTitle;
  if (!$("fitHeroBody").value.trim() && pc.heroBody) $("fitHeroBody").value=pc.heroBody;
  if (!$("fitPrimaryCta").value.trim() && pc.primaryCta) $("fitPrimaryCta").value=pc.primaryCta;
  if (!$("fitSecondaryCta").value.trim() && pc.secondaryCta) $("fitSecondaryCta").value=pc.secondaryCta;
  if (!$("fitNav").value.trim() && pc.navItems?.length) $("fitNav").value=pc.navItems.join(", ");
  if (!$("fitLogoAsset").value.trim() && profile.assetMap?.logoAsset) $("fitLogoAsset").value=profile.assetMap.logoAsset;
  if (!$("fitHeroAsset").value.trim() && profile.assetMap?.heroAsset) $("fitHeroAsset").value=profile.assetMap.heroAsset;
  if ($("fitStack").value==="auto" && profile.stack && profile.stack!=="unknown") {
    const option=[...$("fitStack").options].find(x=>x.value===profile.stack);
    if (option) option.selected=true;
  }

  const blockers=profile.readiness?.blockers||[];
  $("fitBlockers").innerHTML=blockers.length
    ? blockers.map(x=>`<div class="rdFitBlocker"><b>Blocking Accurate build</b><span>${escapeHtml(x)}</span></div>`).join("")
    : '<div class="rdFitPass"><b>Target compatibility ready</b><span>No stack/integration blocker detected.</span></div>';

  const questions=profile.readiness?.questions||[];
  $("fitQuestions").innerHTML=questions.length
    ? '<b>Still needed for higher accuracy</b>'+questions.map(q=>`<div><span>${escapeHtml(q.label)}</span><small>${escapeHtml(q.reason)}</small>${q.required?'<em>Required</em>':'<em class="optional">Helpful</em>'}</div>`).join("")
    : '<b>Required project information complete.</b>';

  const req=profile.requirements||{};
  $("fitRequirements").textContent=[req.node, req.packageManager && req.packageManager!=="none" ? req.packageManager : "", req.windows, req.mac].filter(Boolean).join(" · ");
  if (profile.supportedOutput) $("buildOutput").value="auto";
  updateAccurateAvailability();
}
async function analyzeProjectFit({quiet=false}={}) {
  if (!quiet) busy($("analyzeProjectButton"),true,"Analyzing…");
  try {
    const profile=await api("/api/reference-design/project-fit",{
      method:"POST",
      body:JSON.stringify(collectProjectContext()),
    });
    renderProjectFit(profile);
    return profile;
  } catch(error) {
    notice(error.message);
    return null;
  } finally {
    if (!quiet) busy($("analyzeProjectButton"),false);
  }
}
function renderProjectFileSummary() {
  const rows=state.projectFiles;
  if (!rows.length) {
    $("projectFileSummary").textContent="No local project files selected.";
    updateSourceSummary();
    return;
  }
  const withText=rows.filter(x=>x.text).length;
  const assets=rows.filter(x=>/\.(png|jpe?g|webp|avif|gif|svg|mp4|webm|woff2?|ttf|otf)$/i.test(x.path)).length;
  const portable=rows.filter(x=>x.base64).length;
  $("projectFileSummary").textContent=`${rows.length} local files · ${withText} readable source/design files · ${assets} asset filenames · ${portable} portable assets included · secret/config-private files excluded`;
  updateSourceSummary();
}

function scopeMode() {
  return document.querySelector("input[name='scope']:checked")?.value || "whole";
}
function activateCustomScope() {
  const radio = document.querySelector("input[name='scope'][value='selected']");
  if (radio) radio.checked = true;
}
function candidateById(id) {
  return state.inspection?.candidates?.find(x => x.id === id);
}
function candidateSearchText(c) {
  return [c.family, c.kind, c.label, c.selector, c.textPreview, c.className].filter(Boolean).join(" ").toLowerCase();
}
function filteredCandidates() {
  const q = $("candidateSearch")?.value.trim().toLowerCase() || "";
  return (state.inspection?.candidates || []).filter(c => {
    if (state.activeFamily !== "All" && c.family !== state.activeFamily) return false;
    return !q || candidateSearchText(c).includes(q);
  });
}
function compactCount(n) {
  return Number(n || 0).toLocaleString();
}
function regionMeta(c) {
  const dims = c.rect ? `${Math.round(c.rect.width)}×${Math.round(c.rect.height)}` : "";
  return [c.family, dims].filter(Boolean).join(" · ");
}
function setScopeUi() {
  const selected = scopeMode() === "selected";
  $("pickerGrid").classList.toggle("isWhole", !selected);
  $("candidateSearch").disabled = !selected;
  $("selectFiltered").disabled = !selected;
  $("clearSelection").disabled = !selected;
  document.querySelectorAll(".rdFamilyFilter").forEach(el => { el.disabled = !selected; });
  updateSelectionUi();
  renderOverlays();
}
function toggleCandidate(id) {
  if (state.selected.has(id)) {
    state.selected.delete(id);
  } else {
    if (state.selected.size >= MAX_CUSTOM_SELECTION) {
      notice(`Custom selection supports up to ${MAX_CUSTOM_SELECTION} regions. Remove one region or use Whole page.`);
      return;
    }
    state.selected.add(id);
  }
  if (state.selected.size) activateCustomScope();
  notice("");
  renderCandidates();
  renderOverlays();
  setScopeUi();
}
function updateSelectionUi() {
  const whole = scopeMode() === "whole";
  const selectedRows = [...state.selected].map(candidateById).filter(Boolean);
  const families = new Map();
  for (const c of selectedRows) families.set(c.family, (families.get(c.family) || 0) + 1);
  const familyText = [...families.entries()].map(([k,v]) => `${k} ${v}`).join(" · ");

  $("selectedSummary").textContent = whole
    ? "Whole page selected"
    : state.selected.size
      ? `${state.selected.size} selected${familyText ? " · " + familyText : ""}`
      : "Choose regions or a quick preset";

  $("selectionMeterText").textContent = `${state.selected.size} / ${MAX_CUSTOM_SELECTION} selected`;

  const visible = selectedRows.slice(0, 10);
  const extra = selectedRows.length - visible.length;
  $("selectedChips").innerHTML = whole ? "" :
    visible.map(c => `<button class="rdChip" data-remove="${c.id}" title="Remove ${escapeHtml(c.label || c.kind)}"><span>${escapeHtml(c.kind)}</span>${escapeHtml((c.label || c.selector).slice(0,36))}<b>×</b></button>`).join("") +
    (extra > 0 ? `<span class="rdChip rdChipMore">+${extra} more</span>` : "");

  $("selectedChips").querySelectorAll("[data-remove]").forEach(btn =>
    btn.addEventListener("click", () => toggleCandidate(btn.dataset.remove))
  );
}
function renderFamilyFilters() {
  const counts = state.inspection?.facets?.familyCounts || {};
  const total = state.inspection?.candidateCount || 0;
  $("familyFilters").innerHTML = FAMILY_ORDER.map(family => {
    const count = family === "All" ? total : (counts[family] || 0);
    if (family !== "All" && count === 0) return "";
    return `<button class="rdFamilyFilter ${state.activeFamily === family ? "active" : ""}" type="button" data-family="${family}"><span>${family}</span><b>${compactCount(count)}</b></button>`;
  }).join("");

  $("familyFilters").querySelectorAll("[data-family]").forEach(button => {
    button.addEventListener("click", () => {
      state.activeFamily = button.dataset.family;
      renderFamilyFilters();
      renderCandidates();
      renderOverlays();
    });
  });
}
function renderCandidates() {
  const rows = filteredCandidates();
  $("candidateList").innerHTML = rows.map(c => {
    const motion = c.animation ? '<span class="rdSignal motion">Motion</span>' : "";
    const interactive = c.interactive ? '<span class="rdSignal">Interactive</span>' : "";
    const sticky = c.sticky ? '<span class="rdSignal">Sticky</span>' : "";
    const selector = escapeHtml(c.selector);
    return `<button class="rdCandidate ${state.selected.has(c.id) ? "selected" : ""}" data-id="${c.id}" type="button">
      <span class="rdKind">${escapeHtml(c.kind)}</span>
      <span class="rdCandidateText">
        <span class="rdCandidateTitle"><b>${escapeHtml(c.label || c.kind)}</b></span>
        <span class="rdCandidateMeta">${escapeHtml(regionMeta(c))}</span>
        <small title="${selector}">${selector}</small>
        <span class="rdSignals">${interactive}${motion}${sticky}</span>
      </span>
      <span class="rdSelectMark">${state.selected.has(c.id) ? "✓" : "+"}</span>
    </button>`;
  }).join("") || `<div class="rdEmptyFilter">No regions match this filter.</div>`;

  $("candidateList").querySelectorAll("[data-id]").forEach(btn =>
    btn.addEventListener("click", () => toggleCandidate(btn.dataset.id))
  );
}
function overlayCandidates() {
  if (!state.inspection || scopeMode() !== "selected") return [];
  const filtered = filteredCandidates().slice(0, 120);
  const selected = [...state.selected].map(candidateById).filter(Boolean);
  const map = new Map([...filtered, ...selected].map(c => [c.id, c]));
  return [...map.values()];
}
function renderOverlays() {
  if (!state.inspection) return;
  const w = state.inspection.screenshotWidth;
  const h = state.inspection.screenshotHeight;
  $("overlayLayer").innerHTML = overlayCandidates().filter(c => c.rect?.y < h).map(c => {
    const left = Math.max(0, c.rect.x / w * 100);
    const top = Math.max(0, c.rect.y / h * 100);
    const width = Math.min(100 - left, c.rect.width / w * 100);
    const height = Math.max(.12, c.rect.height / h * 100);
    return `<button type="button" class="rdOverlay family-${escapeHtml((c.family || "Components").toLowerCase())} ${state.selected.has(c.id) ? "selected" : ""}" data-id="${c.id}" title="${escapeHtml(`${c.kind}: ${c.label || c.selector}`)}" style="left:${left}%;top:${top}%;width:${width}%;height:${height}%"></button>`;
  }).join("");
  $("overlayLayer").querySelectorAll("[data-id]").forEach(btn =>
    btn.addEventListener("click", () => toggleCandidate(btn.dataset.id))
  );
}
function rankedFamily(family) {
  return (state.inspection?.candidates || [])
    .filter(c => family === "All" || c.family === family)
    .sort((a,b) => (b.score || 0) - (a.score || 0));
}
function pickBalancedEssential() {
  const quotas = { Structure: 10, Controls: 6, Content: 5, Media: 5, Motion: 2, Components: 2 };
  const picked = [];
  const seen = new Set();
  for (const family of Object.keys(quotas)) {
    for (const c of rankedFamily(family).slice(0, quotas[family])) {
      if (!seen.has(c.id)) { seen.add(c.id); picked.push(c); }
    }
  }
  return picked.sort((a,b) => (b.score || 0) - (a.score || 0)).slice(0, MAX_CUSTOM_SELECTION);
}
function applyPreset(name) {
  if (!state.inspection) return;
  activateCustomScope();
  let rows = [];
  if (name === "essential") rows = pickBalancedEssential();
  else {
    const family = ({ structure:"Structure", content:"Content", controls:"Controls", media:"Media", motion:"Motion" })[name];
    rows = rankedFamily(family).slice(0, MAX_CUSTOM_SELECTION);
    state.activeFamily = family || "All";
  }
  state.selected = new Set(rows.map(c => c.id));
  notice("");
  renderFamilyFilters();
  renderCandidates();
  renderOverlays();
  setScopeUi();
}
function selectFiltered() {
  activateCustomScope();
  const available = filteredCandidates().filter(c => !state.selected.has(c.id));
  const slots = MAX_CUSTOM_SELECTION - state.selected.size;
  for (const c of available.slice(0, Math.max(0, slots))) state.selected.add(c.id);
  if (available.length > slots) notice(`Selected the top ${MAX_CUSTOM_SELECTION} regions. Refine the filter to choose different regions.`, "info");
  else notice("");
  renderCandidates();
  renderOverlays();
  setScopeUi();
}
function resetResult() {
  state.markdown = "";
  state.evidenceJson = "";
  state.build = null;
  $("resultStage").hidden = true;
  $("buildStage").hidden = true;
}

async function checkProvider() {
  try {
    const s = await api("/api/reference-design/status");
    $("providerState").textContent = s.ready ? "Cloud browser ready" : "Cloud browser setup required";
    $("providerState").className = `rdProvider ${s.ready ? "ready" : "notReady"}`;
  } catch {
    $("providerState").textContent = "Cloud browser unavailable";
  }
}

async function handleProjectFiles(files) {
  state.projectFiles=await readProjectFiles(files);
  renderProjectFileSummary();
  invalidateProjectFit();
}
async function scanGithubProject() {
  const url=$("githubRepoUrl").value.trim();
  if(!url){notice("Enter the GitHub repository URL.");return;}
  busy($("scanGithubButton"),true,"Scanning source…");
  $("githubRepoStatus").textContent="Reading repository tree and source…";
  try{
    const token=$("githubRepoToken").value;
    const result=await api("/api/reference-design/project-github",{
      method:"POST",
      body:JSON.stringify({url,ref:$("githubRepoRef").value.trim(),token}),
    });
    // Credentials are single-use in the browser too.
    $("githubRepoToken").value="";
    state.githubScan=result;
    $("githubRepoStatus").textContent=`${result.coverage.textFilesRead} source files · ${result.coverage.assetFilesIndexed} assets · ${result.repository.branch}`;
    updateSourceSummary();
    invalidateProjectFit();
    notice("GitHub repository source indexed. Combine it with local files and/or the live website for stronger project fit.","info");
  }catch(error){
    $("githubRepoToken").value="";
    $("githubRepoStatus").textContent="Scan failed";
    notice(error.message);
  }finally{busy($("scanGithubButton"),false);}
}
async function scanProjectWebsite() {
  const url=$("projectWebsiteUrl").value.trim();
  if(!url){notice("Enter the current project website URL.");return;}
  busy($("scanWebsiteButton"),true,"Scanning website…");
  $("projectWebsiteStatus").textContent="Capturing live content and assets…";
  try{
    const result=await api("/api/reference-design/project-website",{
      method:"POST",
      body:JSON.stringify({url,auth:{mode:"public"}}),
    });
    state.websiteEvidence=result;
    $("projectWebsiteStatus").textContent=`${result.headings?.length||0} headings · ${result.buttons?.length||0} actions · ${result.images?.length||0} images`;
    updateSourceSummary();
    invalidateProjectFit();
    notice("Current website evidence captured. Empty project-content fields can now be filled from live content.","info");
  }catch(error){
    $("projectWebsiteStatus").textContent="Scan failed";
    notice(error.message);
  }finally{busy($("scanWebsiteButton"),false);}
}
$("projectFiles").addEventListener("change", event => handleProjectFiles(event.target.files));
$("projectFolder").addEventListener("change", event => handleProjectFiles(event.target.files));
$("scanGithubButton").addEventListener("click",scanGithubProject);
$("scanWebsiteButton").addEventListener("click",scanProjectWebsite);
for(const id of ["githubRepoUrl","githubRepoRef","projectWebsiteUrl"]){
  $(id).addEventListener("input",()=>{ if(id==="githubRepoUrl"||id==="githubRepoRef")state.githubScan=null; else state.websiteEvidence=null; updateSourceSummary(); invalidateProjectFit(); });
}
document.querySelectorAll("input[name='projectMode']").forEach(input => input.addEventListener("change",()=>{
  $("existingProjectUpload").hidden=projectMode()!=="existing";
  invalidateProjectFit();
}));
for (const id of ["fitProjectName","fitStack","fitTargetRoute","fitTargetPath","fitBrand","fitNav","fitHeroTitle","fitHeroBody","fitPrimaryCta","fitSecondaryCta","fitLogoAsset","fitHeroAsset"]) {
  $(id).addEventListener("input", invalidateProjectFit);
  $(id).addEventListener("change", invalidateProjectFit);
}
$("analyzeProjectButton").addEventListener("click",()=>analyzeProjectFit());
updateSourceSummary();
updateAccurateAvailability();

$("inspectForm").addEventListener("submit", async event => {
  event.preventDefault();
  notice("");
  resetResult();
  const url = $("referenceUrl").value.trim();
  busy($("inspectButton"), true, "Inspecting design…");
  try {
    const data = await api("/api/reference-design/inspect", {
      method: "POST",
      body: JSON.stringify({ url, auth: currentAuth() }),
    });
    state.inspection = data;
    state.selected.clear();
    state.activeFamily = "All";

    $("selectionStage").hidden = false;
    $("previewImage").src = data.screenshot;
    $("referenceTitle").textContent = data.title || new URL(data.finalUrl).hostname;
    $("referenceHost").textContent = new URL(data.finalUrl).hostname;
    $("candidateCount").textContent = `${data.candidateCount} design regions`;
    $("openReference").href = data.finalUrl;
    if (data.authentication?.authenticated) {
      $("authModeLabel").textContent = `${AUTH_LABELS[data.authentication.mode] || "Authenticated"} · verified`;
    }

    renderFamilyFilters();
    renderCandidates();
    renderOverlays();
    setScopeUi();
    $("selectionStage").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    notice(error.message);
  } finally {
    busy($("inspectButton"), false);
  }
});

document.querySelectorAll("input[name='scope']").forEach(input =>
  input.addEventListener("change", setScopeUi)
);
document.querySelectorAll("[data-preset]").forEach(button =>
  button.addEventListener("click", () => applyPreset(button.dataset.preset))
);
$("candidateSearch").addEventListener("input", () => {
  renderCandidates();
  renderOverlays();
});
$("selectFiltered").addEventListener("click", selectFiltered);
$("clearSelection").addEventListener("click", () => {
  state.selected.clear();
  notice("");
  renderCandidates();
  renderOverlays();
  updateSelectionUi();
});

$("generateButton").addEventListener("click", async () => {
  if (!state.inspection) return;
  const scope = scopeMode();
  const selected = [...state.selected].map(candidateById).filter(Boolean);
  if (scope === "selected" && !selected.length) {
    notice("Choose at least one design region, use a Quick select preset, or choose Whole page.");
    return;
  }
  if (selected.length > MAX_CUSTOM_SELECTION) {
    notice(`Choose no more than ${MAX_CUSTOM_SELECTION} custom regions.`);
    return;
  }

  notice("");
  busy($("generateButton"), true, "Measuring all viewports…");
  try {
    const data = await api("/api/reference-design/generate", {
      method: "POST",
      body: JSON.stringify({
        url: state.inspection.finalUrl,
        scope,
        selectors: selected.map(x => x.selector),
        selection: selected.map(x => ({
          selector: x.selector,
          label: x.label,
          kind: x.kind,
          family: x.family,
        })),
        auth: currentAuth(),
      }),
    });

    state.markdown = data.markdown;
    state.filename = data.filename || "DESIGN.md";
    state.evidenceJson = data.evidenceJson || "";
    state.evidenceFilename = data.evidenceFilename || "DESIGN-EVIDENCE.json";

    $("confidencePill").textContent = `${data.summary.confidence}% evidence confidence · ${data.summary.viewportVerified ? "3 viewports verified" : "viewport warning"}`;
    const facts = [
      [data.summary.selectedCount, scope === "whole" ? "Whole page scope" : "Selected regions"],
      [data.summary.componentCount, "Measured regions"],
      [data.summary.meaningfulInteractionCount ?? data.summary.interactionSamples, "State changes"],
      [data.summary.animationCount, "Runtime motion"],
    ];
    $("resultFacts").innerHTML = facts.map(([v,l]) =>
      `<div class="rdFact"><b>${escapeHtml(v)}</b><span>${escapeHtml(l)}</span></div>`
    ).join("");

    $("markdownPreview").textContent = state.markdown.slice(0, 24000) +
      (state.markdown.length > 24000 ? "\n\n… Preview truncated; downloaded DESIGN.md contains the complete specification." : "");
    state.build = null;
    $("buildStage").hidden = true;
    $("resultStage").hidden = false;
    $("resultStage").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    notice(error.message);
  } finally {
    busy($("generateButton"), false);
  }
});

function buildDeviceSize(device) {
  const evidence = state.build?.model?.viewports || {};
  const fallback = {
    desktop: { width: 1440, height: 900 },
    tablet: { width: 820, height: 1180 },
    mobile: { width: 390, height: 844 },
  };
  return evidence[device] || fallback[device] || fallback.desktop;
}
async function loadReferencePreview(device) {
  if (!state.inspection?.finalUrl) return;
  if (state.referencePreviews[device]) {
    $("buildReferenceImage").src=state.referencePreviews[device];
    return;
  }
  const label=$(".rdReferencePane .rdPaneLabel");
  const old=label?.textContent || "Reference capture";
  if(label) label.textContent=`Loading ${device} reference…`;
  try {
    const data=await api("/api/reference-design/preview",{
      method:"POST",
      body:JSON.stringify({
        url:state.inspection.finalUrl,
        viewport:device,
        auth:currentAuth(),
      }),
    });
    state.referencePreviews[device]=data.screenshot;
    $("buildReferenceImage").src=data.screenshot;
    if(label) label.textContent=`Reference · ${data.width}×${data.height}`;
  } catch(error) {
    if(label) label.textContent="Reference preview unavailable";
    if (!state.referencePreviews.desktop && state.inspection?.screenshot) {
      $("buildReferenceImage").src=state.inspection.screenshot;
    }
  } finally {
    if(label && label.textContent.startsWith("Loading ")) label.textContent=old;
  }
}
function renderCertification(device) {
  const row=state.certifications[device];
  $("visualCertification").hidden=!row;
  if(!row)return;
  $("pixelSimilarity").textContent=`${row.metrics.rawPixelSimilarityPct}%`;
  $("structuralSimilarity").textContent=`${row.metrics.structuralSimilarityPct}%`;
  $("certifiedViewport").textContent=`${row.width}×${row.height}`;
  $("certificationNote").textContent=row.metrics.note;
  $("overlayReferenceImage").src=state.referencePreviews[device] || state.inspection?.screenshot || "";
  $("overlayBuildImage").src=row.buildScreenshot;
  $("buildDiffImage").src=row.diffScreenshot;
}
function applyPreviewScale() {
  const shell=$("buildFrameShell"), stage=$("buildScaleStage"), viewport=$("buildFrameViewport");
  if(!shell||!stage||!viewport||!state.build)return;
  const size=buildDeviceSize(state.currentDevice);
  const actualHeight=Math.max(560,Math.min(1180,Number(size.height)||900));
  const available=Math.max(240,viewport.clientWidth-20);
  const scale=state.previewScaleMode==="actual" ? 1 : Math.min(1,available/(Number(size.width)||1440));
  shell.style.width=`${size.width}px`;
  shell.style.height=`${actualHeight}px`;
  shell.style.transform=`scale(${scale})`;
  stage.style.width=`${Math.round((Number(size.width)||1440)*scale)}px`;
  stage.style.height=`${Math.round(actualHeight*scale)}px`;
  stage.dataset.scale=state.previewScaleMode;
  document.querySelectorAll("[data-preview-scale]").forEach(btn =>
    btn.classList.toggle("active",btn.dataset.previewScale===state.previewScaleMode)
  );
}
async function setBuildDevice(device) {
  const shell = $("buildFrameShell");
  if (!shell) return;
  state.currentDevice=device;
  shell.dataset.device = device;
  document.querySelectorAll("[data-device]").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.device === device)
  );
  applyPreviewScale();
  await loadReferencePreview(device);
  renderCertification(device);
}
async function certifyCurrentBuild() {
  if(!state.build || !state.inspection?.finalUrl){
    notice("Build the page before running visual analysis.");
    return null;
  }
  const button=$("certifyBuildButton");
  busy(button,true,"Analyzing pixels…");
  try{
    const result=await api("/api/reference-design/certify",{
      method:"POST",
      body:JSON.stringify({
        url:state.inspection.finalUrl,
        html:state.build.previewHtml,
        viewport:state.currentDevice,
        auth:currentAuth(),
        baseUrl:$("projectWebsiteUrl")?.value.trim() || "",
      }),
    });
    state.certifications[state.currentDevice]=result;
    renderCertification(state.currentDevice);
    notice(`Visual analysis complete: ${result.metrics.structuralSimilarityPct}% structural similarity at ${result.width}×${result.height}.`,"info");
    return result;
  }catch(error){
    notice(error.message);
    return null;
  }finally{busy(button,false);}
}
async function setBuildView(view) {
  if(["overlay","diff"].includes(view) && !state.certifications[state.currentDevice]){
    const result=await certifyCurrentBuild();
    if(!result)return;
  }
  $("buildCompare").dataset.view = view;
  document.querySelectorAll("[data-build-view]").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.buildView === view)
  );
}
function downloadBase64(base64, filename, type = "application/zip") {
  if (!base64) return;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function renderBuildResult(data) {
  state.build = data;
  state.certifications={};
  state.currentDevice="desktop";
  state.previewScaleMode="fit";
  $("visualCertification").hidden=true;
  $("buildReferenceImage").src = state.referencePreviews.desktop || state.inspection?.screenshot || "";
  $("buildFrame").srcdoc = data.previewHtml;
  $("buildSummary").textContent = `${data.output.toUpperCase()} · ${data.summary.renderer || "semantic"} renderer · ${data.summary.hierarchyNodes || data.summary.regions} measured nodes · ${data.summary.projectFiles} ZIP files`;
  $("projectName").textContent = data.filename;
  $("projectFiles").textContent = data.files.map(file => file.path).join(" · ");

  const facts = [
    [data.summary.renderer==="hierarchy-exact" ? data.summary.hierarchyNodes : data.summary.regions, data.summary.renderer==="hierarchy-exact" ? "Hierarchy nodes" : "Compiled regions"],
    [`${data.summary.evidenceConfidence ?? "—"}%`, "Reference evidence"],
    [data.summary.projectFitScore == null ? "—" : `${data.summary.projectFitScore}%`, "Project fit"],
    [data.summary.projectStack || data.output, "Target stack"],
    [data.summary.unknownCount, "Unresolved fields"],
    [data.summary.projectFiles, "ZIP files"],
  ];
  $("buildFacts").innerHTML = facts.map(([value,label]) =>
    `<div class="rdFact"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`
  ).join("");

  $("buildStage").hidden = false;
  setBuildView("build");
  setBuildDevice("desktop");
  $("buildStage").scrollIntoView({ behavior: "smooth", block: "start" });
}

$("buildPageButton").addEventListener("click", async () => {
  if (!state.evidenceJson || !state.markdown) {
    notice("Generate DESIGN.md first, then build the page.");
    return;
  }
  let profile=state.projectProfile;
  if (!profile) profile=await analyzeProjectFit({quiet:true});
  if (!profile) return;
  if ($("buildFidelity").value==="accurate" && !profile.readiness?.accurateReady) {
    const required=(profile.readiness?.questions||[]).filter(q=>q.required).map(q=>q.label).join(", ");
    notice("Accurate build is locked until required project information is complete"+(required ? ": "+required : "."));
    return;
  }
  notice("");
  busy($("buildPageButton"), true, "Compiling project-fit source…");
  try {
    const data = await api("/api/reference-design/build", {
      method: "POST",
      body: JSON.stringify({
        evidenceJson: state.evidenceJson,
        markdown: state.markdown,
        options: {
          output: $("buildOutput").value,
          contentMode: $("buildContent").value,
          fidelity: $("buildFidelity").value,
        },
        projectContext: collectProjectContext(),
      }),
    });
    renderBuildResult(data);
  } catch (error) {
    notice(error.message);
  } finally {
    busy($("buildPageButton"), false);
  }
});

document.querySelectorAll("[data-build-view]").forEach(button =>
  button.addEventListener("click", () => void setBuildView(button.dataset.buildView))
);
document.querySelectorAll("[data-device]").forEach(button =>
  button.addEventListener("click", () => void setBuildDevice(button.dataset.device))
);
document.querySelectorAll("[data-preview-scale]").forEach(button =>
  button.addEventListener("click",()=>{
    state.previewScaleMode=button.dataset.previewScale;
    applyPreviewScale();
  })
);
window.addEventListener("resize",()=>{ if(state.previewScaleMode==="fit") applyPreviewScale(); });
$("certifyBuildButton").addEventListener("click",()=>void certifyCurrentBuild());
$("overlayOpacity").addEventListener("input",event=>{
  const value=Number(event.target.value)||0;
  $("overlayValue").textContent=value+"%";
  $("overlayBuildImage").style.opacity=String(value/100);
});
$("downloadProjectButton").addEventListener("click", () => {
  if (!state.build) return;
  downloadBase64(state.build.zipBase64, state.build.filename);
});

function downloadText(content, filename, type) {
  if (!content) return;
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("downloadButton").addEventListener("click", () =>
  downloadText(state.markdown, state.filename, "text/markdown;charset=utf-8")
);
$("downloadEvidenceButton").addEventListener("click", () =>
  downloadText(state.evidenceJson, state.evidenceFilename, "application/json;charset=utf-8")
);
$("copyButton").addEventListener("click", async () => {
  if (!state.markdown) return;
  await navigator.clipboard.writeText(state.markdown);
  const button = $("copyButton");
  const old = button.textContent;
  button.textContent = "Copied";
  setTimeout(() => button.textContent = old, 1200);
});
$("authToggle").addEventListener("click", () => setAuthPanel($("authPanel").hidden));
$("authMode").addEventListener("change", updateAuthUi);

$("newButton").addEventListener("click", () => {
  state.inspection = null;
  state.selected.clear();
  state.activeFamily = "All";
  state.markdown = "";
  state.evidenceJson = "";
  state.build = null;
  state.referencePreviews = {};
  state.certifications = {};
  state.currentDevice = "desktop";
  state.previewScaleMode = "fit";
  state.projectProfile = null;
  state.projectFiles = [];
  state.githubScan = null;
  state.websiteEvidence = null;
  if($("githubRepoUrl")) $("githubRepoUrl").value="";
  if($("githubRepoRef")) $("githubRepoRef").value="";
  if($("githubRepoToken")) $("githubRepoToken").value="";
  if($("projectWebsiteUrl")) $("projectWebsiteUrl").value="";
  if($("githubRepoStatus")) $("githubRepoStatus").textContent="Not scanned";
  if($("projectWebsiteStatus")) $("projectWebsiteStatus").textContent="Not scanned";
  renderProjectFileSummary();
  $("selectionStage").hidden = true;
  $("resultStage").hidden = true;
  $("buildStage").hidden = true;
  clearAuthSecrets();
  $("referenceUrl").focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

updateAuthUi();
checkProvider();
