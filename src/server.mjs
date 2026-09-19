import express from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { CONFIG } from "./config.mjs";
import { jobs } from "./jobs.mjs";
import { id, ensureDir, writeJson, readJson, exists } from "./fs-utils.mjs";
import { scanWebsite } from "./browser/scanner.mjs";
import { acquireTarget, githubStatus, gitState, run } from "./target/repo.mjs";
import { scanSourceProject } from "./target/source-scan.mjs";
import { buildComparison } from "./intelligence/compare.mjs";
import { buildPlan } from "./intelligence/plan.mjs";
import { writeAuditMarkdown, writeComparisonMarkdown } from "./intelligence/reporter.mjs";
import { writeDesignBlueprint } from "./intelligence/design-blueprint.mjs";
import { buildDesignPack } from "./intelligence/design-pack.mjs";
import { prepareExecutionWorkspace, compareTrees, applySafeCopyToOriginal, rollbackSafeCopyApply } from "./execution/workspace.mjs";
import { runConfiguredAgent } from "./execution/agent-runner.mjs";
import { verifyProject } from "./execution/verify.mjs";

const app=express();
app.use(express.json({limit:"5mb"}));
app.use(express.static(path.join(CONFIG.packageRoot,"src","web")));
app.use("/data",express.static(CONFIG.dataDir,{fallthrough:true}));

// Vercel ignores express.static(); public/** is served by Vercel's CDN.
// Keep local static middleware above, but route Vercel root to public/index.html.
app.get("/", (req, res, next) => {
  if (process.env.VERCEL) {
    return res.redirect(302, "/index.html");
  }
  next();
});

const sessions=new Map();

function sessionDir(sid){return path.join(CONFIG.runsDir,sid)}
function sessionFile(sid,name){return path.join(sessionDir(sid),name)}
async function saveSession(s){await writeJson(sessionFile(s.id,"session.json"),s)}
async function ensureSession(sid){
  let s=sessions.get(sid);
  if(!s){
    s=await readJson(sessionFile(sid,"session.json"));
    if(s)sessions.set(sid,s);
  }
  if(!s)throw new Error("Unknown session");
  return s;
}
function progressFor(job){
  return p=>{
    jobs.patch(job.id,{
      stage:p.stage||job.stage,
      progress:Number.isFinite(p.progress)?p.progress:job.progress,
      etaSeconds:Object.prototype.hasOwnProperty.call(p,"etaSeconds")?p.etaSeconds:job.etaSeconds,
      completedUnits:Object.prototype.hasOwnProperty.call(p,"completedUnits")?p.completedUnits:job.completedUnits,
      totalUnits:Object.prototype.hasOwnProperty.call(p,"totalUnits")?p.totalUnits:job.totalUnits,
    });
    if(p.message)jobs.log(job.id,p.message);
  }
}
async function newSession(){
  const s={id:id("session"),createdAt:new Date().toISOString(),reference:null,target:null,comparison:null,plan:null,execution:null};
  await ensureDir(sessionDir(s.id));sessions.set(s.id,s);await saveSession(s);return s
}

async function executionCapability(s){
  const agentConfigured=!!CONFIG.agent.command;
  if(!s?.target){
    return {ready:false,sourceType:null,mode:"not-ready",agentConfigured,canAutoImplement:false,canApplyBack:false,canHandoff:!!s?.plan,message:"Scan a target first."};
  }
  const sourceType=s.target?.source?.type||s.target?.acquired?.type||null;
  const root=s.target?.acquired?.root||null;
  if(!root){
    return {ready:!!s.plan,sourceType,mode:"handoff-only",agentConfigured,canAutoImplement:false,canApplyBack:false,canHandoff:!!s.plan,originalUntouched:true,message:"Live/localhost URL supports Scan, Compare and Plan. Automatic code implementation needs a Local project folder or GitHub repository. You can still generate a coding handoff."};
  }
  const gs=await gitState(root);
  const mode=gs.isGit&&gs.clean?"git-worktree":"safe-copy";
  return {
    ready:!!s.plan,sourceType,mode,agentConfigured,
    canAutoImplement:!!s.plan&&agentConfigured,
    canApplyBack:s.execution?.checkpoint?.mode==="safe-copy"&&s.execution?.verificationPassed===true&&s.execution?.applied!==true,
    canHandoff:!!s.plan,
    originalUntouched:s.execution?.applied!==true,
    git:{isGit:gs.isGit,clean:gs.clean??null,branch:gs.branch||null,head:gs.head||null},
    message:mode==="git-worktree"
      ?(agentConfigured?"Clean Git project: implementation runs in an isolated worktree; original branch remains untouched.":"Clean Git project detected. Configure a coding agent for automatic implementation, or generate the handoff.")
      :(agentConfigured?"Git is optional: implementation runs in an isolated safe copy; original folder stays untouched until explicit apply-back.":"Non-Git or dirty-Git project is supported through an isolated safe copy. Configure a coding agent or generate the handoff.")
  };
}

app.get("/api/health",(req,res)=>res.json({ok:true,version:"0.2.5",platform:CONFIG.platform,port:CONFIG.port,agentConfigured:!!CONFIG.agent.command,scanModes:["blueprint-fast","design-only","fast-deep","standard","extreme"]}));
app.get("/api/github/status",async(req,res)=>res.json(await githubStatus()));
app.post("/api/github/auth/start",async(req,res)=>{
  try{
    const child=spawn("gh",["auth","login","-h","github.com","--git-protocol","https","--web"],{
      stdio:"inherit",shell:false,windowsHide:false
    });
    child.on("error",e=>console.error("GitHub auth launch failed:",e));
    res.status(202).json({started:true,message:"GitHub CLI authorization started in the KK-FRONTEND terminal/browser flow."});
  }catch(e){res.status(500).json({error:String(e.message||e)})}
});
app.post("/api/session",async(req,res)=>res.json(await newSession()));
app.get("/api/sessions/recent",async(req,res)=>{
  try{
    const dirs=await fs.readdir(CONFIG.runsDir,{withFileTypes:true});
    const rows=[];
    for(const d of dirs.filter(x=>x.isDirectory())){
      const x=await readJson(path.join(CONFIG.runsDir,d.name,"session.json"));
      if(x)rows.push(x);
    }
    rows.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json(rows.slice(0,20));
  }catch(e){res.json([])}
});
app.get("/api/session/:id",async(req,res)=>{try{res.json(await ensureSession(req.params.id))}catch(e){res.status(404).json({error:e.message})}});
app.get("/api/execution/capability/:sessionId",async(req,res)=>{try{res.json(await executionCapability(await ensureSession(req.params.sessionId)))}catch(e){res.status(400).json({error:String(e.message||e)})}});
app.get("/api/jobs/:id",(req,res)=>{const j=jobs.get(req.params.id);if(!j)return res.status(404).json({error:"not found"});res.json(j)});
app.post("/api/jobs/:id/pause",(req,res)=>res.json({ok:jobs.pause(req.params.id)}));
app.post("/api/jobs/:id/resume",(req,res)=>res.json({ok:jobs.resume(req.params.id)}));
app.post("/api/jobs/:id/stop",(req,res)=>res.json({ok:jobs.stop(req.params.id)}));
app.get("/api/jobs/:id/events",(req,res)=>{
  const j=jobs.get(req.params.id);if(!j)return res.status(404).end();
  res.setHeader("Content-Type","text/event-stream");res.setHeader("Cache-Control","no-cache");res.flushHeaders?.();
  const send=x=>res.write(`data: ${JSON.stringify(x)}\n\n`);send(j);
  const off=jobs.subscribe(req.params.id,send);req.on("close",off);
});

app.post("/api/scan/reference",async(req,res)=>{
  const {sessionId,url,options={}}=req.body;
  const s=await ensureSession(sessionId);
  const job=jobs.create("reference-scan",{sessionId,url});
  res.json({jobId:job.id});
  jobs.run(job,async()=>{
    const out=path.join(sessionDir(sessionId),"reference");
    const audit=await scanWebsite({url,outDir:out,resume:true,...options,progress:progressFor(job),control:jobs.control(job.id)});
    if(audit.cancelled){
      s.reference={url,root:out,partial:true,partialAuditFile:"reference/audit.partial.json",cancelled:true};
      await saveSession(s);return s.reference;
    }
    await fs.copyFile(path.join(out,"audit.json"),sessionFile(sessionId,"reference-audit.json"));
    await writeAuditMarkdown(sessionFile(sessionId,"reference-audit.json"),sessionFile(sessionId,"REFERENCE-AUDIT.md"),"Reference Frontend Audit");
    const designResult=await writeDesignBlueprint({auditRoot:out,auditFile:sessionFile(sessionId,"reference-audit.json"),outFile:sessionFile(sessionId,"DESIGN.md")});
    const packResult=await buildDesignPack({
      sessionDir:sessionDir(sessionId),referenceRoot:out,
      designMd:sessionFile(sessionId,"DESIGN.md"),
      referenceAudit:sessionFile(sessionId,"reference-audit.json"),
      referenceUrl:url,anchors:designResult.anchors
    });
    s.reference={url,root:out,auditFile:"reference-audit.json",designFile:"DESIGN.md",designBytes:designResult.bytes,designPack:"DESIGN-PACK",designPackFiles:packResult.manifest.counts.files,designPackScreenshots:packResult.manifest.counts.screenshots,partial:false,cancelled:false};
    await saveSession(s);return s.reference;
  }).catch(()=>{});
});

app.post("/api/scan/target",async(req,res)=>{
  const {sessionId,source,options={}}=req.body;
  const s=await ensureSession(sessionId);
  const job=jobs.create("target-scan",{sessionId,source});
  res.json({jobId:job.id});
  jobs.run(job,async()=>{
    const progress=progressFor(job);
    const acquired=await acquireTarget(source,{progress});
    const out=path.join(sessionDir(sessionId),"target-before");await ensureDir(out);
    let sourceAudit=null,runtimeAudit=null;
    if(acquired.root){
      sourceAudit=await scanSourceProject(acquired.root,path.join(out,"source-audit.json"),{progress});
      const url=options.runtimeUrl||source.runtimeUrl||null;
      if(url)runtimeAudit=await scanWebsite({url,outDir:path.join(out,"runtime"),resume:true,...options,progress,control:jobs.control(job.id)});
    }else if(acquired.url){
      runtimeAudit=await scanWebsite({url:acquired.url,outDir:path.join(out,"runtime"),resume:true,...options,progress,control:jobs.control(job.id)});
    }
    if(runtimeAudit?.cancelled){
      s.target={source,acquired,root:out,partial:true,cancelled:true,sourceAuditFile:sourceAudit?"target-before/source-audit.json":null,runtimeRoot:path.join(out,"runtime")};
      await saveSession(s);return s.target;
    }
    const canonical=runtimeAudit||{schema:"kk-frontend-audit/v2",kind:"source-only",target:acquired.root,evidenceStatus:"VERIFIED",routes:[]};
    canonical.sourceAuditFile=sourceAudit?"source-audit.json":null;
    await writeJson(sessionFile(sessionId,"target-before-audit.json"),canonical);
    await writeAuditMarkdown(sessionFile(sessionId,"target-before-audit.json"),sessionFile(sessionId,"TARGET-BEFORE-AUDIT.md"),"Target Before Audit");
    s.target={source,acquired,root:out,auditFile:"target-before-audit.json",sourceAuditFile:sourceAudit?"target-before/source-audit.json":null,runtimeRoot:runtimeAudit?path.join(out,"runtime"):null,partial:false,cancelled:false};
    await saveSession(s);return s.target;
  }).catch(()=>{});
});

app.post("/api/compare",async(req,res)=>{
  const {sessionId}=req.body;const s=await ensureSession(sessionId);
  const job=jobs.create("compare",{sessionId});res.json({jobId:job.id});
  jobs.run(job,async()=>{
    if(!s.reference?.root)throw new Error("Reference scan is required.");
    if(!s.target?.runtimeRoot)throw new Error("Target runtime URL scan is required for visual comparison.");
    const out=sessionFile(sessionId,"comparison.json");
    const result=await buildComparison({referenceRoot:s.reference.root,targetRoot:s.target.runtimeRoot,outFile:out,progress:progressFor(job)});
    await writeComparisonMarkdown(out,sessionFile(sessionId,"COMPARISON.md"));
    s.comparison={file:"comparison.json",count:result.entries.length};await saveSession(s);return s.comparison;
  }).catch(()=>{});
});

app.get("/api/comparison/:sessionId",async(req,res)=>{
  try{const p=sessionFile(req.params.sessionId,"comparison.json");res.json(JSON.parse(await fs.readFile(p,"utf8")))}
  catch(e){res.status(404).json({error:e.message})}
});

app.post("/api/plan",async(req,res)=>{
  const {sessionId,selectedIds=[]}=req.body;const s=await ensureSession(sessionId);
  const job=jobs.create("plan",{sessionId,selected:selectedIds.length});res.json({jobId:job.id});
  jobs.run(job,async()=>{
    const sourceAudit=s.target?.sourceAuditFile?await readJson(path.join(sessionDir(sessionId),s.target.sourceAuditFile)):null;
    const plan=await buildPlan({comparisonFile:sessionFile(sessionId,"comparison.json"),selectedIds,outDir:sessionDir(sessionId),targetSourceAudit:sourceAudit});
    s.plan={file:"implementation-plan.json",selected:selectedIds.length};await saveSession(s);return s.plan;
  }).catch(()=>{});
});

app.post("/api/handoff",async(req,res)=>{
  try{
    const {sessionId}=req.body;
    const s=await ensureSession(sessionId);
    if(!s.plan)throw new Error("Build a Safe Plan first.");
    const text=`# KK-FRONTEND Implementation Handoff

Generated: ${new Date().toISOString()}

## Target
- Source type: ${s.target?.source?.type||"unknown"}
- Source: ${s.target?.source?.value||s.target?.acquired?.root||s.target?.acquired?.url||"unknown"}
- Runtime: ${s.target?.source?.runtimeUrl||s.target?.acquired?.url||"not supplied"}

## Use
1. Read DESIGN-PACK/DESIGN.md and PACK-MANIFEST.json.
2. Read implementation-plan.json, selected-upgrades.json and AGENT-TASK.md.
3. Apply only approved frontend changes.
4. Preserve APIs, routes, auth, data/state, business logic and functionality.
5. Verify against bundled screenshots.
6. Do not invent unavailable evidence.

This handoff works without Git and without an automatically configured coding agent.
`;
    await fs.writeFile(sessionFile(sessionId,"IMPLEMENTATION-HANDOFF.md"),text,"utf8");
    s.handoff={file:"IMPLEMENTATION-HANDOFF.md",createdAt:new Date().toISOString()};
    await saveSession(s);
    res.json(s.handoff);
  }catch(e){res.status(400).json({error:String(e.message||e)})}
});

app.post("/api/execute",async(req,res)=>{
  const {sessionId,approved}=req.body;
  const s=await ensureSession(sessionId);
  if(approved!==true)return res.status(400).json({error:"Explicit implementation approval is required."});
  if(!s.plan)return res.status(400).json({error:"Build a Safe Plan first."});
  if(!s.target?.acquired?.root)return res.status(400).json({error:"This target is URL-only. Scan/Compare/Plan work normally, but code implementation requires a Local project folder or GitHub repository. Use Generate Coding Handoff when source code is not connected."});
  if(!CONFIG.agent.command)return res.status(400).json({error:"No coding agent is configured. Generate Coding Handoff, or configure KK_FRONTEND_AGENT_COMMAND and restart KK-FRONTEND."});

  const job=jobs.create("execute",{sessionId});
  res.json({jobId:job.id});
  jobs.run(job,async()=>{
    const progress=progressFor(job);
    const checkpoint=await prepareExecutionWorkspace(s.target.acquired.root,sessionDir(sessionId),{progress});
    const taskFile=path.join(sessionDir(sessionId),"AGENT-TASK.md");
    const workTask=path.join(checkpoint.worktree,"AGENT-TASK.md");
    await fs.copyFile(taskFile,workTask);
    const designPack=path.join(sessionDir(sessionId),"DESIGN-PACK");
    if(await exists(designPack))await fs.cp(designPack,path.join(checkpoint.worktree,"DESIGN-PACK"),{recursive:true,force:true});

    const agent=await runConfiguredAgent({worktree:checkpoint.worktree,taskFile:workTask,runDir:sessionDir(sessionId),progress});
    const sourceAudit=await scanSourceProject(checkpoint.worktree,path.join(sessionDir(sessionId),"target-after-source-audit.json"),{progress});
    const verification=await verifyProject({root:checkpoint.worktree,sourceAudit,runDir:sessionDir(sessionId),progress});

    let changedText="";
    if(checkpoint.mode==="git-worktree"){
      const diff=await run("git",["status","--short"],{cwd:checkpoint.worktree,timeout:30000});
      changedText=diff.stdout||"(clean)";
    }else{
      const diff=await compareTrees(checkpoint.originalRoot,checkpoint.worktree);
      await writeJson(sessionFile(sessionId,"workspace-diff.json"),diff);
      changedText=[...diff.changed.map(x=>`M ${x}`),...diff.added.map(x=>`A ${x}`),...diff.removed.map(x=>`D ${x}`)].join("\n")||"(clean)";
    }

    const changelog=`# KK-FRONTEND Change Log

- Executed: ${new Date().toISOString()}
- Execution mode: ${checkpoint.mode}
- Original project: ${checkpoint.originalRoot}
- Workspace: ${checkpoint.worktree}
- Original untouched during implementation: true
- Verification passed: ${verification.passed}

## Changed files

${changedText}
`;
    await fs.writeFile(sessionFile(sessionId,"CHANGELOG.md"),changelog,"utf8");
    if(!verification.passed)throw new Error("Verification failed. Isolated workspace retained; original project remains unchanged.");
    s.execution={checkpoint,agent,verificationPassed:true,applied:false,completedAt:new Date().toISOString()};
    await saveSession(s);
    return s.execution;
  }).catch(()=>{});
});

app.post("/api/apply-local",async(req,res)=>{
  const {sessionId,approved}=req.body;
  const s=await ensureSession(sessionId);
  if(approved!==true)return res.status(400).json({error:"Explicit apply-back approval is required."});
  if(!s.execution?.verificationPassed)return res.status(400).json({error:"No verified execution workspace is ready to apply."});
  if(s.execution?.checkpoint?.mode!=="safe-copy")return res.status(400).json({error:"Apply-back is only used for Local/non-Git safe-copy execution. Git worktrees remain isolated for normal Git review/merge."});
  if(s.execution?.applied)return res.status(400).json({error:"Verified changes were already applied."});

  const job=jobs.create("apply-local",{sessionId});
  res.json({jobId:job.id});
  jobs.run(job,async()=>{
    const progress=progressFor(job);
    const checkpoint=s.execution.checkpoint;
    const applyResult=await applySafeCopyToOriginal(checkpoint,sessionDir(sessionId),{progress});
    const after=await scanSourceProject(checkpoint.originalRoot,path.join(sessionDir(sessionId),"target-applied-source-audit.json"),{progress});
    const verification=await verifyProject({root:checkpoint.originalRoot,sourceAudit:after,runDir:path.join(sessionDir(sessionId),"apply-verification"),progress});
    if(!verification.passed){
      await rollbackSafeCopyApply(applyResult,checkpoint,{progress});
      throw new Error("Apply-back verification failed. Original source files were restored from backup.");
    }
    s.execution.applied=true;
    s.execution.appliedAt=new Date().toISOString();
    s.execution.applyBackup=applyResult.backupRoot;
    await saveSession(s);
    return {applied:true,backupRoot:applyResult.backupRoot,diff:applyResult.diff,verificationPassed:true};
  }).catch(()=>{});
});

app.get("/api/artifacts/:sessionId",async(req,res)=>{
  try{
    const sid=req.params.sessionId,dir=sessionDir(sid);
    const files=await fs.readdir(dir,{withFileTypes:true});
    const rows=files.map(f=>({name:f.name,type:f.isDirectory()?"dir":"file",url:`/data/runs/${sid}/${encodeURIComponent(f.name)}`}));
    for(const name of ["DESIGN.md","CODING-AGENT-PROMPT.md","PACK-MANIFEST.json","PACK-README.md"]){
      const p=path.join(dir,"DESIGN-PACK",name);
      if(await exists(p))rows.unshift({name:`DESIGN-PACK/${name}`,type:"file",featured:true,url:`/data/runs/${sid}/DESIGN-PACK/${encodeURIComponent(name)}`});
    }
    res.json(rows);
  }catch(e){res.status(404).json({error:e.message})}
});

app.listen(CONFIG.port,"127.0.0.1",()=>{
  const url=`http://127.0.0.1:${CONFIG.port}`;
  console.log(`KK-FRONTEND running at ${url}`);
  if(process.env.KK_FRONTEND_NO_OPEN!=="1"){
    const cmd=process.platform==="win32"?["cmd",["/c","start","",url]]
      :process.platform==="darwin"?["open",[url]]
      :["xdg-open",[url]];
    spawn(cmd[0],cmd[1],{detached:true,stdio:"ignore"}).unref();
  }
});

