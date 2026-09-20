const $ = id => document.getElementById(id);
const state = { inspection: null, selected: new Set(), markdown: "", filename: "DESIGN.md", evidenceJson: "", evidenceFilename: "DESIGN-EVIDENCE.json" };

function notice(message, kind = "error") {
  const el = $("notice");
  el.hidden = !message;
  el.textContent = message || "";
  el.style.borderColor = kind === "info" ? "rgba(124,156,255,.28)" : "";
  el.style.background = kind === "info" ? "rgba(124,156,255,.07)" : "";
  el.style.color = kind === "info" ? "#c8d3ff" : "";
}
function busy(button, yes, label) {
  if (!button) return;
  if (yes) { button.dataset.label = button.textContent; button.textContent = label; button.disabled = true; }
  else { button.textContent = button.dataset.label || button.textContent; button.disabled = false; }
}
async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}
function scopeMode() { return document.querySelector("input[name='scope']:checked")?.value || "whole"; }
function setScopeUi() {
  const selected = scopeMode() === "selected";
  $("pickerGrid").classList.toggle("isWhole", !selected);
  $("candidateSearch").disabled = !selected;
  $("clearSelection").disabled = !selected;
  updateSelectionUi();
}
function candidateById(id) { return state.inspection?.candidates?.find(x => x.id === id); }
function toggleCandidate(id) {
  if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
  if (state.selected.size) document.querySelector("input[name='scope'][value='selected']").checked = true;
  renderCandidates(); renderOverlays(); setScopeUi();
}
function updateSelectionUi() {
  const whole = scopeMode() === "whole";
  $("selectedSummary").textContent = whole ? "Whole page selected" : `${state.selected.size} region${state.selected.size === 1 ? "" : "s"} selected`;
  $("selectedChips").innerHTML = whole ? "" : [...state.selected].map(id => {
    const c = candidateById(id); if (!c) return "";
    return `<button class="rdChip" data-remove="${id}" title="Remove ${escapeHtml(c.label || c.kind)}">${escapeHtml(c.kind)} · ${escapeHtml((c.label || c.selector).slice(0,42))} ×</button>`;
  }).join("");
  $("selectedChips").querySelectorAll("[data-remove]").forEach(btn => btn.addEventListener("click", () => toggleCandidate(btn.dataset.remove)));
}
function escapeHtml(value) { return String(value || "").replace(/[&<>'"]/g, x => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[x])); }
function renderCandidates() {
  const q = $("candidateSearch").value.trim().toLowerCase();
  const rows = (state.inspection?.candidates || []).filter(c => !q || `${c.kind} ${c.label} ${c.selector}`.toLowerCase().includes(q));
  $("candidateList").innerHTML = rows.map(c => {
    const motion = c.animation ? '<span class="rdMotion">Motion</span>' : "";
    const selector = escapeHtml(c.selector);
    return `<button class="rdCandidate ${state.selected.has(c.id) ? "selected" : ""}" data-id="${c.id}" type="button"><span class="rdKind">${escapeHtml(c.kind)}</span><span class="rdCandidateText"><span class="rdCandidateTitle"><b>${escapeHtml(c.label || c.kind)}</b>${motion}</span><small title="${selector}">${selector}</small></span></button>`;
  }).join("") || `<div style="padding:18px;color:#8995a7;font-size:12px">No matching regions.</div>`;
  $("candidateList").querySelectorAll("[data-id]").forEach(btn => btn.addEventListener("click", () => toggleCandidate(btn.dataset.id)));
}
function renderOverlays() {
  if (!state.inspection) return;
  const w = state.inspection.screenshotWidth, h = state.inspection.screenshotHeight;
  $("overlayLayer").innerHTML = state.inspection.candidates.filter(c => c.rect.y < h).map(c => {
    const left = c.rect.x / w * 100, top = c.rect.y / h * 100, width = c.rect.width / w * 100, height = c.rect.height / h * 100;
    return `<button type="button" class="rdOverlay ${state.selected.has(c.id) ? "selected" : ""}" data-id="${c.id}" title="${escapeHtml(`${c.kind}: ${c.label || c.selector}`)}" style="left:${left}%;top:${top}%;width:${width}%;height:${height}%"></button>`;
  }).join("");
  $("overlayLayer").querySelectorAll("[data-id]").forEach(btn => btn.addEventListener("click", () => toggleCandidate(btn.dataset.id)));
}
function resetResult() { state.markdown = ""; state.evidenceJson = ""; $("resultStage").hidden = true; }

async function checkProvider() {
  try {
    const s = await api("/api/reference-design/status");
    $("providerState").textContent = s.ready ? "Cloud browser ready · Web-only mode" : "Cloud browser setup required before live extraction";
    $("providerState").className = `rdProvider ${s.ready ? "ready" : "notReady"}`;
  } catch { $("providerState").textContent = "Cloud browser status unavailable"; }
}

$("inspectForm").addEventListener("submit", async event => {
  event.preventDefault(); notice(""); resetResult();
  const url = $("referenceUrl").value.trim();
  busy($("inspectButton"), true, "Inspecting…");
  try {
    const data = await api("/api/reference-design/inspect", { method: "POST", body: JSON.stringify({ url }) });
    state.inspection = data; state.selected.clear();
    $("selectionStage").hidden = false;
    $("previewImage").src = data.screenshot;
    $("referenceTitle").textContent = data.title || new URL(data.finalUrl).hostname;
    $("candidateCount").textContent = `${data.candidateCount} selectable regions`;
    $("openReference").href = data.finalUrl;
    renderCandidates(); renderOverlays(); setScopeUi();
    $("selectionStage").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) { notice(error.message); }
  finally { busy($("inspectButton"), false); }
});

document.querySelectorAll("input[name='scope']").forEach(input => input.addEventListener("change", setScopeUi));
$("candidateSearch").addEventListener("input", renderCandidates);
$("clearSelection").addEventListener("click", () => { state.selected.clear(); renderCandidates(); renderOverlays(); updateSelectionUi(); });

$("generateButton").addEventListener("click", async () => {
  if (!state.inspection) return;
  const scope = scopeMode();
  const selected = [...state.selected].map(candidateById).filter(Boolean);
  if (scope === "selected" && !selected.length) { notice("Select at least one reference region, or choose Whole Page."); return; }
  notice(""); busy($("generateButton"), true, "Measuring Desktop · Tablet · Mobile…");
  try {
    const data = await api("/api/reference-design/generate", { method: "POST", body: JSON.stringify({ url: state.inspection.finalUrl, scope, selectors: selected.map(x => x.selector) }) });
    state.markdown = data.markdown; state.filename = data.filename || "DESIGN.md";
    state.evidenceJson = data.evidenceJson || ""; state.evidenceFilename = data.evidenceFilename || "DESIGN-EVIDENCE.json";
    $("confidencePill").textContent = `${data.summary.confidence}% evidence confidence · ${data.summary.viewportVerified ? "viewports verified" : "viewport warning"}`;
    const facts = [
      [data.summary.selectedCount, "Scope selectors"],
      [data.summary.componentCount, "Measured regions"],
      [data.summary.meaningfulInteractionCount ?? data.summary.interactionSamples, "Observable state changes"],
      [data.summary.animationCount, "Runtime animations"],
    ];
    $("resultFacts").innerHTML = facts.map(([v,l]) => `<div class="rdFact"><b>${escapeHtml(v)}</b><span>${escapeHtml(l)}</span></div>`).join("");
    $("markdownPreview").textContent = state.markdown.slice(0, 24000) + (state.markdown.length > 24000 ? "\n\n… Preview truncated; downloaded DESIGN.md contains the complete specification." : "");
    $("resultStage").hidden = false;
    $("resultStage").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) { notice(error.message); }
  finally { busy($("generateButton"), false); }
});

function downloadText(content, filename, type) {
  if (!content) return;
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("downloadButton").addEventListener("click", () => downloadText(state.markdown, state.filename, "text/markdown;charset=utf-8"));
$("downloadEvidenceButton").addEventListener("click", () => downloadText(state.evidenceJson, state.evidenceFilename, "application/json;charset=utf-8"));
$("copyButton").addEventListener("click", async () => {
  if (!state.markdown) return;
  await navigator.clipboard.writeText(state.markdown);
  const button = $("copyButton"); const old = button.textContent; button.textContent = "Copied"; setTimeout(() => button.textContent = old, 1200);
});
$("newButton").addEventListener("click", () => {
  state.inspection = null; state.selected.clear(); state.markdown = ""; state.evidenceJson = ""; $("selectionStage").hidden = true; $("resultStage").hidden = true; $("referenceUrl").focus(); window.scrollTo({ top: 0, behavior: "smooth" });
});

checkProvider();
