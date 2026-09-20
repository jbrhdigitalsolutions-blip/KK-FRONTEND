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
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}
function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, x => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[x]));
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

$("inspectForm").addEventListener("submit", async event => {
  event.preventDefault();
  notice("");
  resetResult();
  const url = $("referenceUrl").value.trim();
  busy($("inspectButton"), true, "Inspecting design…");
  try {
    const data = await api("/api/reference-design/inspect", {
      method: "POST",
      body: JSON.stringify({ url }),
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
function setBuildDevice(device) {
  const shell = $("buildFrameShell");
  if (!shell) return;
  const size = buildDeviceSize(device);
  shell.dataset.device = device;
  shell.style.width = `${size.width}px`;
  shell.style.height = `${Math.max(560, Math.min(1180, size.height))}px`;
  document.querySelectorAll("[data-device]").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.device === device)
  );
}
function setBuildView(view) {
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
  $("buildReferenceImage").src = state.inspection?.screenshot || "";
  $("buildFrame").srcdoc = data.previewHtml;
  $("buildSummary").textContent = `${data.output.toUpperCase()} · ${data.summary.regions} compiled regions · ${data.summary.projectFiles} project files`;
  $("projectName").textContent = data.filename;
  $("projectFiles").textContent = data.files.map(file => file.path).join(" · ");

  const facts = [
    [data.summary.regions, "Compiled regions"],
    [`${data.summary.evidenceConfidence ?? "—"}%`, "Evidence confidence"],
    [data.summary.unknownCount, "Unresolved fields"],
    [data.summary.projectFiles, "Project files"],
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
  notice("");
  busy($("buildPageButton"), true, "Compiling page…");
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
  button.addEventListener("click", () => setBuildView(button.dataset.buildView))
);
document.querySelectorAll("[data-device]").forEach(button =>
  button.addEventListener("click", () => setBuildDevice(button.dataset.device))
);
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
$("newButton").addEventListener("click", () => {
  state.inspection = null;
  state.selected.clear();
  state.activeFamily = "All";
  state.markdown = "";
  state.evidenceJson = "";
  state.build = null;
  $("selectionStage").hidden = true;
  $("resultStage").hidden = true;
  $("buildStage").hidden = true;
  $("referenceUrl").focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

checkProvider();
