import fs from "node:fs/promises";
import path from "node:path";
import { writeJson, writeText } from "../fs-utils.mjs";

const PRESERVE=["backend/API behavior","routes","business logic","authentication","permissions","form submissions","data/state","navigation","analytics","integrations","accessibility behavior"];
const STAGE_ORDER={"foundation-tokens":1,"layout-shell":2,"shared-components":3,"pages":4,"responsive":5,"interactions-animations":6};

function stageFor(e){
  const text=(String(e.category||"")+" "+String(e.subcategory||"")).toLowerCase();
  if(text.includes("token")||text.includes("color")||text.includes("typography")||text.includes("spacing"))return"foundation-tokens";
  if(text.includes("responsive")||text.includes("mobile")||text.includes("tablet"))return"responsive";
  if(text.includes("animation")||text.includes("interaction")||text.includes("scroll"))return"interactions-animations";
  if(text.includes("route"))return"pages";
  if(text.includes("layout")||text.includes("header")||text.includes("footer")||text.includes("sidebar")||text.includes("navigation"))return"layout-shell";
  return"shared-components";
}
function operationFor(stage){
  return({
    "foundation-tokens":"adapt-design-foundation",
    "layout-shell":"adapt-layout-shell",
    "shared-components":"adapt-existing-component",
    "pages":"adapt-route-surface",
    "responsive":"adapt-responsive-behavior",
    "interactions-animations":"adapt-interaction-motion"
  })[stage];
}
function unique(xs){return[...new Set((xs||[]).filter(Boolean))]}
function routeNeedles(route){
  try{return new URL(route).pathname.split("/").filter(Boolean).map(x=>x.toLowerCase())}catch{return String(route||"").split(/[^a-z0-9]+/i).filter(x=>x.length>2).map(x=>x.toLowerCase())}
}
function candidateFiles(e,intel,map){
  const stage=stageFor(e),out=[];
  const mapped=(map?.mappings||[]).filter(x=>x.target?.path&&(!e.route||x.reference?.route===e.route));
  out.push(...mapped.slice(0,6).map(x=>x.target.path));
  if(stage==="foundation-tokens")out.push(...(intel?.tokenFiles||[]).slice(0,8),...(intel?.styleFiles||[]).slice(0,8));
  if(stage==="layout-shell")out.push(...(intel?.components||[]).filter(x=>(x.roles||[]).some(r=>["navigation","header","footer","sidebar","dashboard"].includes(r))).slice(0,8).map(x=>x.path),...(intel?.styleFiles||[]).slice(0,5));
  if(stage==="pages"){
    const needles=routeNeedles(e.route);
    out.push(...(intel?.routeFiles||[]).filter(f=>!needles.length||needles.some(n=>f.toLowerCase().includes(n))).slice(0,10));
  }
  if(stage==="responsive"||stage==="interactions-animations")out.push(...(intel?.styleFiles||[]).slice(0,10),...mapped.slice(0,6).map(x=>x.target.path));
  return unique(out).slice(0,16);
}
function verificationFor(stage,risk){
  const v=["baseline-sha256-precondition","syntax-parser","changed-file-scope"];
  if(["foundation-tokens","layout-shell","responsive","interactions-animations"].includes(stage))v.push("affected-route-responsive-visual-check");
  if(["shared-components","pages"].includes(stage))v.push("affected-component-or-route-runtime-check");
  if(risk==="high")v.push("targeted-functional-test");
  return v;
}

export async function buildPlan({comparisonFile,selectedIds,outDir,targetSourceAudit=null,targetSourceIntelligence=null,componentMap=null}){
  const comparison=JSON.parse(await fs.readFile(comparisonFile,"utf8"));
  const selected=(comparison.entries||[]).filter(e=>selectedIds.includes(e.id));
  if(!selected.length)throw new Error("Select at least one comparison row.");
  const categories=[...new Set(selected.map(e=>e.category))];
  const routes=[...new Set(selected.map(e=>e.route))];
  const fileByPath=new Map((targetSourceIntelligence?.files||[]).map(x=>[x.path,x]));
  const actions=selected.map((e,index)=>{
    const stage=stageFor(e),allowedFiles=candidateFiles(e,targetSourceIntelligence,componentMap);
    const fileRisks=allowedFiles.map(f=>fileByPath.get(f)?.risk).filter(Boolean);
    const risk=e.risk==="high"||fileRisks.includes("high")?"high":e.risk==="medium"||fileRisks.includes("medium")?"medium":"low";
    return{
      id:"mig-"+String(index+1).padStart(3,"0"),comparisonId:e.id,stage,stageOrder:STAGE_ORDER[stage],
      operation:operationFor(stage),route:e.route,category:e.category,subcategory:e.subcategory,
      allowedFiles,requiresMapping:allowedFiles.length===0,
      baselineHashes:Object.fromEntries(allowedFiles.map(f=>[f,fileByPath.get(f)?.sha256||null]).filter(([,h])=>h)),
      preserve:PRESERVE,
      referenceEvidence:e.evidence,
      expectedChange:e.difference,
      risk,
      verification:verificationFor(stage,risk),
      prohibited:["blind string replacement","editing files outside allowedFiles","changing API/auth/data contracts to obtain visual parity","inventing UNKNOWN reference values"]
    };
  }).sort((a,b)=>a.stageOrder-b.stageOrder||a.id.localeCompare(b.id));
  const risk=actions.some(e=>e.risk==="high")?"high":actions.some(e=>e.risk==="medium")?"medium":"low";
  const plan={
    schema:"kk-frontend-implementation-plan/v2",createdAt:new Date().toISOString(),
    selectedComparisonIds:selectedIds,selectedCount:selected.length,affectedRoutes:routes,categories,risk,
    preserve:PRESERVE,
    dependencyPolicy:"Reuse existing equivalent dependencies first. Any new dependency requires explicit compatibility/license/bundle review.",
    executionMode:"staged-source-aware-migration",
    sourceBaseline:{gitHead:targetSourceIntelligence?.baseline?.gitHead||targetSourceAudit?.git?.head||null,gitClean:targetSourceIntelligence?.baseline?.gitClean??targetSourceAudit?.git?.clean??null},
    designContract:"design-contract.json",
    componentMap:"component-map.json",
    actions,
    stageOrder:Object.entries(STAGE_ORDER).sort((a,b)=>a[1]-b[1]).map(([name])=>name),
    note:"Every action has a bounded file scope. requiresMapping=true means STOP and refine mapping before mutation."
  };
  await writeJson(path.join(outDir,"selected-upgrades.json"),{selectedIds,selected});
  await writeJson(path.join(outDir,"implementation-plan.json"),plan);

  const lines=[
    "# KK-FRONTEND Source-Aware Upgrade Task","",
    "Operate only inside the KK-FRONTEND isolated execution workspace.","",
    "## Read first",
    "1. .kk-frontend/DESIGN-PACK/DESIGN.md",
    "2. .kk-frontend/design-contract.json",
    "3. .kk-frontend/component-map.json",
    "4. .kk-frontend/implementation-plan.json","",
    "## Hard rules",
    "- Preserve backend/API behavior, routes, business logic, auth, permissions, forms, data/state, navigation, analytics, integrations and accessibility behavior.",
    "- allowedFiles is a hard boundary for each action. Do not edit unrelated files.",
    "- Verify baseline SHA256 before editing an existing file.",
    "- If requiresMapping=true, stop that action and report the unresolved mapping; do not guess.",
    "- Implement stages in stageOrder and verify each stage before continuing.",
    "- Do not copy proprietary source or unauthorized assets from the reference.",
    "- Do not invent UNKNOWN/UNAVAILABLE/RESTRICTED reference values.","",
    "## Approved migration actions","",
    JSON.stringify(actions,null,2),"",
    "## Required result",
    "Write .kk-frontend/AGENT-RESULT.json with changedFiles, actionsCompleted, commandsRun, tests, visualChecks, runtimeUrl (only if the changed workspace is actually running there), warnings, unresolved and rollbackNotes."
  ];
  await writeText(path.join(outDir,"AGENT-TASK.md"),lines.join("\n"));
  return plan;
}
