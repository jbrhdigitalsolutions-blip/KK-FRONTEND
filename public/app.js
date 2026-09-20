let sessionId=null,currentComparison=null,currentJob=null,lastLogId=null,currentCapability=null,referenceCatalog=null;
const pickerSelected=new Set();
const $=s=>document.querySelector(s);
const showNotice=(message,type="info")=>{const n=$("#notice");if(!n)return;n.hidden=false;n.className=`notice ${type}`;n.textContent=message;clearTimeout(showNotice._t);showNotice._t=setTimeout(()=>{n.hidden=true},9000)};
const log=(m)=>{$("#jobLog").textContent=($("#jobLog").textContent+"\n"+m).trim().slice(-24000);$("#jobLog").scrollTop=$("#jobLog").scrollHeight};
async function api(url,opt={}){const r=await fetch(url,{headers:{"Content-Type":"application/json"},...opt});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||`${r.status}`);return j}
function needSession(){if(!sessionId)throw new Error("Create or resume a session first.")}
function fmtEta(sec){if(!Number.isFinite(sec)||sec<0)return"";if(sec<60)return`ETA ~${sec}s`;const m=Math.round(sec/60);if(m<60)return`ETA ~${m}m`;return`ETA ~${Math.floor(m/60)}h ${m%60}m`}
function setSession(id){sessionId=id;$("#sessionId").textContent=id||"No session";if(id)localStorage.setItem("kkFrontendSessionId",id);else localStorage.removeItem("kkFrontendSessionId")}
async function watchJob(jobId,onDone){
  currentJob=jobId;lastLogId=null;$("#jobStatus").textContent="running";$("#jobLog").textContent="";
  const es=new EventSource(`/api/jobs/${jobId}/events`);
  es.onmessage=e=>{
    const j=JSON.parse(e.data);
    $("#jobStatus").textContent=j.status;$("#jobStage").textContent=j.stage;$("#jobPct").textContent=`${j.progress||0}%`;$("#progressBar").style.width=`${j.progress||0}%`;
    $("#jobUnits").textContent=Number.isFinite(j.completedUnits)&&Number.isFinite(j.totalUnits)?`${j.completedUnits}/${j.totalUnits} units`:"";
    $("#jobEta").textContent=fmtEta(j.etaSeconds);
    const last=j.messages?.at(-1);if(last&&last.id!==lastLogId){lastLogId=last.id;log(last.message)}
    const err=j.errors?.at(-1);if(err&&err.id!==lastLogId){lastLogId=err.id;log("ERROR: "+err.message)}
    if(["passed","failed","stopped"].includes(j.status)){
      es.close();refreshArtifacts();refreshExecutionCapability().catch(()=>{});
      if(j.status==="failed")showNotice(j.errors?.at(-1)?.message||"Task failed. See Live Progress for details.","error");
      if(j.status==="passed")showNotice("Task completed successfully.","success");
      onDone?.(j);
    }
  };
}
async function refreshGithub(){const gh=await api("/api/github/status");$("#githubState").textContent=gh.available?(gh.authenticated?"GitHub CLI authenticated":"GitHub CLI installed, authentication required"):"GitHub CLI not found";return gh}
async function tryRestoreSession(){
  const saved=localStorage.getItem("kkFrontendSessionId");if(!saved)return false;
  try{const s=await api(`/api/session/${saved}`);setSession(s.id);return true}catch{localStorage.removeItem("kkFrontendSessionId");return false}
}
async function resumeLatestSession(){const rows=await api("/api/sessions/recent");if(!rows.length)throw new Error("No previous KK-FRONTEND sessions found.");setSession(rows[0].id);await refreshArtifacts();await refreshExecutionCapability();await loadReferenceCatalog().catch(()=>{});return rows[0]}
async function init(){
  const h=await api("/api/health");
  $("#health").innerHTML=`<span class="healthDot"></span><span>v${esc(h.version)} • ${esc(h.platform)} • agent ${h.agentConfigured?"ready":"not configured"}</span>`;
  updateTargetModeUI();
  await refreshGithub();
  await tryRestoreSession();
  await refreshExecutionCapability().catch(()=>{});
  initWorkflowNavigation();
}

function initWorkflowNavigation(){
  const links=[...document.querySelectorAll("[data-step-link]")];
  const sections=links.map(link=>document.getElementById(link.getAttribute("href").slice(1))).filter(Boolean);
  if(!links.length||!sections.length)return;
  const activate=id=>{
    for(const link of links)link.classList.toggle("active",link.dataset.stepLink===id);
  };
  for(const link of links){
    link.addEventListener("click",()=>activate(link.dataset.stepLink));
  }
  const observer=new IntersectionObserver(entries=>{
    const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
    if(visible?.target?.id)activate(visible.target.id);
  },{rootMargin:"-18% 0px -68% 0px",threshold:[0,.1,.25,.5]});
  for(const section of sections)observer.observe(section);
}

function updateTargetModeUI(){
  const type=$("#targetType").value,label=$("#targetValueLabel"),input=$("#targetValue"),runtime=$("#runtimeUrl"),hint=$("#targetModeHint"),gh=$("#githubTools");
  gh.style.display=type==="github"?"block":"none";
  if(type==="local"){label.firstChild.textContent="Project folder ";input.placeholder="C:\\project\\my-app";runtime.placeholder="http://localhost:3000";hint.textContent="Git is optional. Clean Git uses an isolated worktree; non-Git or dirty Git uses an isolated safe copy. Your original folder stays untouched during implementation."}
  if(type==="github"){label.firstChild.textContent="GitHub repository ";input.placeholder="owner/repository";runtime.placeholder="http://localhost:3000";hint.textContent="KK-FRONTEND clones the repository and uses isolated Git execution. GitHub CLI authentication is required."}
  if(type==="url"){label.firstChild.textContent="Website URL ";input.placeholder="http://localhost:3000 or https://example.com";runtime.placeholder="same URL (optional)";hint.textContent="URL-only mode can Scan → Compare → Plan and generate a coding handoff. Automatic source-code implementation requires a Local folder or GitHub repository."}
}
$("#targetType").onchange=updateTargetModeUI;
async function refreshExecutionCapability(){
  const box=$("#executionCapability"),badge=$("#executionModeBadge"),execute=$("#executeBtn"),handoff=$("#handoffBtn"),apply=$("#applyLocalBtn"),note=$("#applyLocalNote"),verifyAfter=$("#verifyAfterBtn"),visualState=$("#visualVerificationState");
  if(!sessionId){currentCapability=null;box.textContent="Create or resume a session first.";badge.textContent="No session";execute.disabled=true;handoff.disabled=true;apply.hidden=true;if(verifyAfter)verifyAfter.disabled=true;if(visualState)visualState.textContent="Visual verification not run.";return}
  try{
    const c=await api(`/api/execution/capability/${sessionId}`);currentCapability=c;box.textContent=c.message;badge.textContent=({"git-worktree":"Git worktree","safe-copy":"Safe copy","handoff-only":"Handoff only","not-ready":"Not ready"}[c.mode]||c.mode);badge.dataset.mode=c.mode;
    execute.disabled=!c.canAutoImplement;handoff.disabled=!c.canHandoff;apply.hidden=!c.canApplyBack;note.hidden=!c.canApplyBack;if(verifyAfter)verifyAfter.disabled=!c.canVerifyVisual;if(visualState)visualState.textContent=c.visualVerificationPassed?"Visual verification PASS":c.visualVerificationStatus==="failed"?"Visual verification FAILED — inspect unresolved differences":c.canVerifyVisual?"Code PASS — visual verification required":"Visual verification not ready";
    execute.textContent=c.mode==="safe-copy"?"Implement in Safe Copy":"Implement in Safe Workspace";
    if(!c.agentConfigured&&c.canHandoff)handoff.textContent="Generate Coding Handoff — Agent Not Configured";else handoff.textContent="Generate Coding Handoff";
  }catch(e){box.textContent=e.message;badge.textContent="Not ready";execute.disabled=true;handoff.disabled=true;apply.hidden=true;if(verifyAfter)verifyAfter.disabled=true}
}
$("#githubAuth").onclick=async()=>{try{const r=await api("/api/github/auth/start",{method:"POST",body:"{}"});alert(r.message);setTimeout(refreshGithub,4000)}catch(e){alert(e.message)}};
$("#githubRefresh").onclick=()=>refreshGithub().catch(e=>alert(e.message));
$("#newSession").onclick=async()=>{const s=await api("/api/session",{method:"POST",body:"{}"});setSession(s.id);currentComparison=null;referenceCatalog=null;pickerSelected.clear();renderComparison();updatePickerSelected();$("#pickerInspector").textContent="Scan the Reference, then load the Design Picker.";$("#generatedSource").textContent="Select reference design entities and click Generate Source Code.";await refreshArtifacts();await refreshExecutionCapability();showNotice("New workspace created. Start with the Reference scan.","success")};
$("#resumeLatest").onclick=async()=>{try{await resumeLatestSession()}catch(e){alert(e.message)}};
function scanOptions(){return{maxRoutes:+$("#referenceRoutes").value,headless:$("#headless").value==="true",downloadAssets:true,mode:$("#scanMode").value,designOnly:$("#designOnly").checked,scanLocaleVariants:$("#scanLocales").checked,includeRoutePattern:$("#includeRoutes").value.trim(),excludeRoutePattern:$("#excludeRoutes").value.trim(),resume:true}}
$("#scanReference").onclick=async()=>{try{needSession();const x=await api("/api/scan/reference",{method:"POST",body:JSON.stringify({sessionId,url:$("#referenceUrl").value,options:scanOptions()})});watchJob(x.jobId,async j=>{if(j.status==="passed"){await loadReferenceCatalog();showNotice("Reference scan complete. Design Picker is ready.","success")}})}catch(e){alert(e.message)}};
$("#scanTarget").onclick=async()=>{try{
  needSession();const type=$("#targetType").value;let value=$("#targetValue").value.trim(),runtimeUrl=$("#runtimeUrl").value.trim();
  if(type==="url"){value=value||runtimeUrl;if(!value)throw new Error("Enter the live/localhost URL.");runtimeUrl=runtimeUrl||value}
  else if(!value)throw new Error(type==="local"?"Enter the local project folder path.":"Enter the GitHub owner/repository.");
  const source={type,value,runtimeUrl},options={...scanOptions(),runtimeUrl,maxRoutes:Math.min(60,+$("#referenceRoutes").value||60)};
  const x=await api("/api/scan/target",{method:"POST",body:JSON.stringify({sessionId,source,options})});
  watchJob(x.jobId,()=>refreshExecutionCapability());
}catch(e){showNotice(e.message,"error")}};
$("#pauseJob").onclick=async()=>{if(!currentJob)return;await api(`/api/jobs/${currentJob}/pause`,{method:"POST",body:"{}"}).catch(e=>alert(e.message))};
$("#resumeJob").onclick=async()=>{if(!currentJob)return;await api(`/api/jobs/${currentJob}/resume`,{method:"POST",body:"{}"}).catch(e=>alert(e.message))};
$("#stopJob").onclick=async()=>{if(!currentJob)return;if(!confirm("Stop this scan safely? Completed artifacts will be retained and the same session can resume later."))return;await api(`/api/jobs/${currentJob}/stop`,{method:"POST",body:"{}"}).catch(e=>alert(e.message))};

const pickerAssetUrl=p=>`/data/runs/${encodeURIComponent(sessionId)}/reference/${String(p||"").split("/").map(encodeURIComponent).join("/")}`;

async function loadReferenceCatalog(){
  needSession();
  referenceCatalog=await api(`/api/reference/entities/${sessionId}`);
  const routeSelect=$("#pickerRoute");
  routeSelect.innerHTML=(referenceCatalog.routes||[]).map((r,i)=>`<option value="${esc(r.url)}"${i===0?" selected":""}>${esc(new URL(r.url).pathname||"/")}</option>`).join("");
  refreshPickerViewports();
  renderPicker();
  $("#pickerSummary").textContent=`${referenceCatalog.counts?.total||0} selectable design entities • Sections ${referenceCatalog.counts?.section||0} • Components ${referenceCatalog.counts?.component||0} • Text ${referenceCatalog.counts?.text||0} • Animations ${referenceCatalog.counts?.animation||0}`;
  return referenceCatalog;
}
function refreshPickerViewports(){
  const route=$("#pickerRoute").value;
  const r=(referenceCatalog?.routes||[]).find(x=>x.url===route);
  $("#pickerViewport").innerHTML=(r?.viewports||[]).map((v,i)=>`<option value="${esc(v.name||"")}"${i===0?" selected":""}>${esc(v.name||`${v.width}×${v.height}`)}</option>`).join("");
}
function pickerEntities(){
  if(!referenceCatalog)return[];
  const route=$("#pickerRoute").value,vp=$("#pickerViewport").value,type=$("#pickerType").value;
  return (referenceCatalog.entities||[]).filter(e=>e.route===route&&e.viewport?.name===vp&&(type==="all"||e.type===type));
}
function setPickerInspector(e){
  if(!e){$("#pickerInspector").textContent="Click a highlighted reference design entity.";return}
  const detail={
    id:e.id,type:e.type,title:e.title,route:e.route,viewport:e.viewport,selector:e.selector,
    rect:e.rect,style:e.style,animation:e.animation||null,evidence:e.evidence
  };
  $("#pickerInspector").textContent=JSON.stringify(detail,null,2);
}
function updatePickerSelected(){
  $("#pickerSelectedCount").textContent=pickerSelected.size;
  const list=$("#pickerSelectionList");
  const map=new Map((referenceCatalog?.entities||[]).map(e=>[e.id,e]));
  list.innerHTML=[...pickerSelected].slice(0,40).map(id=>{const e=map.get(id);return e?`<button class="selectionChip" data-id="${esc(id)}" title="${esc(e.selector||"")}">${esc(e.type)} · ${esc(e.title||e.selector||id)}</button>`:""}).join("");
  list.querySelectorAll(".selectionChip").forEach(b=>b.onclick=()=>{pickerSelected.delete(b.dataset.id);updatePickerSelected();renderPicker()});
}
function renderPicker(){
  const canvas=$("#pickerCanvas"),img=$("#pickerImage"),overlay=$("#pickerOverlay");
  if(!referenceCatalog){overlay.innerHTML="";setPickerInspector(null);return}
  const entities=pickerEntities();
  const first=entities[0]||(referenceCatalog.entities||[]).find(e=>e.route===$("#pickerRoute").value&&e.viewport?.name===$("#pickerViewport").value);
  if(!first?.screenshot){overlay.innerHTML="";showNotice("No screenshot is available for this route/viewport.","error");return}
  img.src=pickerAssetUrl(first.screenshot);
  const draw=()=>{
    overlay.innerHTML="";
    const docW=Number(first.documentViewport?.width||first.viewport?.width||img.naturalWidth||1);
    const docH=Number(first.documentViewport?.scrollHeight||first.viewport?.height||img.naturalHeight||1);
    for(const e of entities.slice(0,700)){
      const r=e.rect;if(!r||!r.width||!r.height)continue;
      const box=document.createElement("button");
      box.type="button";box.className=`pickerBox type-${e.type}${pickerSelected.has(e.id)?" selected":""}`;
      box.dataset.id=e.id;box.title=`${e.type}: ${e.title||e.selector||e.id}`;
      box.style.left=`${Math.max(0,(r.x/docW)*100)}%`;
      box.style.top=`${Math.max(0,(r.y/docH)*100)}%`;
      box.style.width=`${Math.max(.35,(r.width/docW)*100)}%`;
      box.style.height=`${Math.max(.15,(r.height/docH)*100)}%`;
      box.onclick=ev=>{ev.stopPropagation();if(pickerSelected.has(e.id))pickerSelected.delete(e.id);else pickerSelected.add(e.id);setPickerInspector(e);updatePickerSelected();box.classList.toggle("selected",pickerSelected.has(e.id))};
      box.onmouseenter=()=>setPickerInspector(e);
      overlay.appendChild(box);
    }
    $("#pickerVisibleCount").textContent=entities.length;
  };
  img.onload=draw;
  if(img.complete)draw();
}
async function savePickerSelection(){
  if(!pickerSelected.size)throw new Error("Select at least one reference Section, Component, Text or Animation.");
  return await api("/api/selection",{method:"POST",body:JSON.stringify({sessionId,entityIds:[...pickerSelected]})});
}
$("#loadPicker").onclick=()=>loadReferenceCatalog().catch(e=>showNotice(e.message,"error"));
$("#pickerRoute").onchange=()=>{refreshPickerViewports();renderPicker()};
$("#pickerViewport").onchange=renderPicker;
$("#pickerType").onchange=renderPicker;
$("#clearPicker").onclick=()=>{pickerSelected.clear();updatePickerSelected();renderPicker();$("#generatedSource").textContent=""};
$("#savePickerSelection").onclick=async()=>{try{const r=await savePickerSelection();showNotice(`Saved ${r.count} reference design selections.`,"success");await refreshArtifacts()}catch(e){showNotice(e.message,"error")}};
$("#generateSource").onclick=async()=>{try{
  await savePickerSelection();
  const generation=await api("/api/code/generate",{method:"POST",body:JSON.stringify({sessionId,entityIds:[...pickerSelected],options:{includeLiteralText:$("#includeReferenceText").checked}})});
  $("#generatedSource").textContent=`Framework: ${generation.framework}\nMode: ${generation.mode}\n\n=== ${generation.preview.componentFile} ===\n${generation.preview.component}\n\n=== reference-design-selection.css ===\n${generation.preview.css}\n\nTarget hints:\n${JSON.stringify(generation.targetHints,null,2)}`;
  showNotice(`Generated source for ${generation.selectedEntityIds.length} selected design entities.`,"success");
  await refreshArtifacts();
}catch(e){showNotice(e.message,"error")}};

$("#compareBtn").onclick=async()=>{try{needSession();const x=await api("/api/compare",{method:"POST",body:JSON.stringify({sessionId})});watchJob(x.jobId,async j=>{if(j.status==="passed"){currentComparison=await api(`/api/comparison/${sessionId}`);renderComparison()}})}catch(e){alert(e.message)}};
function renderComparison(){
  const body=$("#comparisonBody");body.innerHTML="";const entries=currentComparison?.entries||[];
  const categoryControl=$("#filterCategory"),previousCategory=categoryControl.value;
  const categories=[...new Set(entries.map(e=>e.category))].sort();
  categoryControl.innerHTML='<option value="">All categories</option>'+categories.map(c=>`<option>${esc(c)}</option>`).join("");
  if(categories.includes(previousCategory))categoryControl.value=previousCategory;
  const q=$("#filterText").value.toLowerCase(),cat=categoryControl.value;const visible=entries.filter(e=>(!cat||e.category===cat)&&(!q||JSON.stringify(e).toLowerCase().includes(q)));
  for(const e of visible){const tr=document.createElement("tr");tr.dataset.id=e.id;tr.innerHTML=`<td><input class="pick" type="checkbox" ${e.selected?"checked":""}></td><td class="groupCell" data-group="route" title="Double-click to select this route group">${esc(e.route)}</td><td class="groupCell" data-group="category" title="Double-click to select this category">${esc(e.category)}</td><td class="groupCell" data-group="subcategory" title="Double-click to select this subcategory">${esc(e.subcategory)}</td><td>${esc(short(e.reference))}</td><td>${esc(short(e.target))}</td><td>${esc(e.difference)}</td><td class="impact-${e.impact}">${esc(e.impact)}</td><td class="risk-${e.risk}">${esc(e.risk)}</td>`;tr.querySelector(".pick").onchange=ev=>{e.selected=ev.target.checked;updateSelected()};tr.querySelectorAll(".groupCell").forEach(cell=>cell.ondblclick=()=>{const field=cell.dataset.group,value=String(e[field]??"");for(const x of currentComparison.entries)if(String(x[field]??"")===value)x.selected=true;renderComparison()});body.appendChild(tr)}
  updateSelected();renderVisualDiffs();
}
function renderVisualDiffs(){const box=$("#visualDiffs");if(!box)return;box.innerHTML="";for(const v of currentComparison?.visualDiffs||[]){const card=document.createElement("div");card.className="visualCard";const base=`/data/runs/${sessionId}/`;card.innerHTML=`<b>${esc(v.route)}</b><br><small>${esc(v.viewport)} • ${esc(v.pct)}% pixel mismatch</small><div class="visualTriplet"><div><small>Reference</small><img src="${base+v.referenceScreenshot}"></div><div><small>Target</small><img src="${base+v.targetScreenshot}"></div><div><small>Diff</small><img src="${base+v.diffScreenshot}"></div></div>`;box.appendChild(card)}}
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const short=v=>{const s=typeof v==="string"?v:JSON.stringify(v);return s.length>220?s.slice(0,220)+"…":s};
function updateSelected(){
  const entries=currentComparison?.entries||[];
  const selected=entries.filter(e=>e.selected).length;
  $("#selectedCount").textContent=selected;
  const master=$("#selectAllHeader");
  if(master){
    master.checked=entries.length>0&&selected===entries.length;
    master.indeterminate=selected>0&&selected<entries.length;
  }
}
function visibleEntries(){
  if(!currentComparison)return[];
  const ids=new Set([...document.querySelectorAll("#comparisonBody tr")].map(tr=>tr.dataset.id));
  return currentComparison.entries.filter(e=>ids.has(String(e.id)));
}
$("#filterText").oninput=renderComparison;$("#filterCategory").onchange=renderComparison;
$("#selectAll").onclick=()=>{for(const e of currentComparison?.entries||[])e.selected=true;renderComparison()};
$("#selectVisible").onclick=()=>{for(const e of visibleEntries())e.selected=true;renderComparison()};
$("#selectSameGroup").onclick=()=>{
  const entries=currentComparison?.entries||[];
  const checked=entries.filter(e=>e.selected);
  if(!checked.length){alert("Select at least one comparison row first.");return}
  const field=$("#groupBy").value;
  const values=new Set(checked.map(e=>String(e[field]??"")));
  for(const e of entries)if(values.has(String(e[field]??"")))e.selected=true;
  renderComparison();
};
$("#selectAllHeader").onchange=ev=>{for(const e of currentComparison?.entries||[])e.selected=ev.target.checked;renderComparison()};
$("#clearSelection").onclick=()=>{for(const e of currentComparison?.entries||[])e.selected=false;renderComparison()};
$("#planBtn").onclick=async()=>{try{needSession();const selectedIds=(currentComparison?.entries||[]).filter(e=>e.selected).map(e=>e.id);if(!selectedIds.length)throw new Error("Select at least one comparison row.");const x=await api("/api/plan",{method:"POST",body:JSON.stringify({sessionId,selectedIds})});watchJob(x.jobId,async j=>{$("#planPreview").textContent=JSON.stringify(j.result,null,2);await refreshExecutionCapability()})}catch(e){alert(e.message)}};
$("#handoffBtn").onclick=async()=>{try{needSession();const r=await api("/api/handoff",{method:"POST",body:JSON.stringify({sessionId})});showNotice(`Coding handoff created: ${r.file}`,"success");await refreshArtifacts();await refreshExecutionCapability()}catch(e){showNotice(e.message,"error")}};
$("#executeBtn").onclick=async()=>{try{needSession();if(!$("#approveExecute").checked)throw new Error("Tick the implementation approval checkbox first.");const x=await api("/api/execute",{method:"POST",body:JSON.stringify({sessionId,approved:true})});watchJob(x.jobId,()=>refreshExecutionCapability())}catch(e){showNotice(e.message,"error")}};
$("#verifyAfterBtn").onclick=async()=>{try{needSession();const runtimeUrl=$("#afterRuntimeUrl").value.trim();if(!runtimeUrl)throw new Error("Enter the changed workspace runtime URL first.");const x=await api("/api/verify-visual-after",{method:"POST",body:JSON.stringify({sessionId,runtimeUrl})});watchJob(x.jobId,async j=>{if(j.status==="passed"){showNotice(j.result?.passed?"Post-change visual verification PASS.":"Visual verification completed with unresolved differences.","success");await refreshArtifacts();await refreshExecutionCapability()}})}catch(e){showNotice(e.message,"error")}};
$("#applyLocalBtn").onclick=async()=>{try{needSession();if(!confirm("Apply VERIFIED safe-copy changes to the original local project? KK-FRONTEND will back up affected source files first and roll back automatically if verification fails."))return;const x=await api("/api/apply-local",{method:"POST",body:JSON.stringify({sessionId,approved:true})});watchJob(x.jobId,()=>refreshExecutionCapability())}catch(e){showNotice(e.message,"error")}};
async function refreshArtifacts(){if(!sessionId)return;try{const a=await api(`/api/artifacts/${sessionId}`);$("#artifacts").innerHTML=a.map(x=>`<a href="${x.url}" target="_blank"${x.featured?' class="featuredArtifact"':''}>${x.featured?"★ ":""}${esc(x.name)}${x.type==="dir"?"/":""}</a>`).join("")}catch{}}
$("#refreshArtifacts").onclick=refreshArtifacts;
init().catch(e=>{$("#health").textContent="Error";log(e.message)});
