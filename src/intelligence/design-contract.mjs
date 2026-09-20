import fs from "node:fs/promises";
import path from "node:path";
import { writeJson } from "../fs-utils.mjs";

async function readJson(file,fallback=null){try{return JSON.parse(await fs.readFile(file,"utf8"))}catch{return fallback}}
function addFreq(map,items,source){
  for(const item of items||[]){
    const value=typeof item==="object"?item.value:item;
    if(value==null||value==="")continue;
    const key=String(value);
    const row=map.get(key)||{value:key,count:0,sources:[]};
    row.count+=Number(item?.count||1);
    if(row.sources.length<12&&!row.sources.includes(source))row.sources.push(source);
    map.set(key,row);
  }
}
function sorted(map,limit=40){return[...map.values()].sort((a,b)=>b.count-a.count||a.value.localeCompare(b.value)).slice(0,limit)}
function contractValue(value,status,source){return{value,status,source}}

export async function buildDesignContract({auditRoot,auditFile,entityCatalog=null,outFile}){
  const audit=await readJson(auditFile);
  if(!audit)throw new Error("Reference audit is required to build design contract.");
  const shared=await readJson(path.join(auditRoot,audit.sharedCssFile||"shared-css.json"),{});
  const tokenMaps={colors:new Map(),fontSizes:new Map(),fontFamilies:new Map(),fontWeights:new Map(),lineHeights:new Map(),letterSpacing:new Map(),radii:new Map(),spacing:new Map(),shadows:new Map(),opacity:new Map()};
  const routes=[];
  for(const rep of audit.representativeRoutes||[]){
    if(!rep.file)continue;
    const route=await readJson(path.join(auditRoot,rep.file));
    if(!route)continue;
    routes.push({url:route.url,templateKey:route.templateKey||null,file:rep.file,clusterId:route.clusterId||null,evidenceStatus:route.evidenceStatus||audit.evidenceStatus||"VERIFIED"});
    for(const key of Object.keys(tokenMaps))addFreq(tokenMaps[key],route.designTokens?.[key],rep.file);
  }
  const breakpoints=[...new Set([...(shared.breakpointsPx||[]),...(audit.coverage?.globalBreakpointsPx||[])].map(Number).filter(Number.isFinite))].sort((a,b)=>a-b);
  const entities=(entityCatalog?.entities||[]).map(e=>({id:e.id,type:e.type,route:e.route,title:e.title||null,selector:e.selector||null,evidence:e.evidence||null}));
  const contract={
    schema:"kk-frontend-design-contract/v1",createdAt:new Date().toISOString(),
    reference:{target:audit.target||null,capturedAt:audit.capturedAt||null,scanMode:audit.mode||null,evidenceStatus:audit.evidenceStatus||"VERIFIED"},
    rules:{
      machineSourceOfTruth:true,
      preserveTargetBusinessSemantics:true,
      unknownPolicy:"UNKNOWN/UNAVAILABLE/RESTRICTED values must not be invented.",
      assetPolicy:"Reference assets are evidence only unless reuse is explicitly authorized.",
      visualMatchPolicy:"Reference evidence confidence is not implementation visual similarity; visual similarity must be measured after implementation."
    },
    global:{
      breakpointsPx:contractValue(breakpoints,"VERIFIED","shared-css + reference audit"),
      cssCustomProperties:contractValue(shared.customProperties||{},"VERIFIED","shared-css.json"),
      fontFaces:contractValue(shared.fontFaces||[],"VERIFIED","shared-css.json"),
      keyframes:contractValue(shared.keyframes||[],"VERIFIED","shared-css.json"),
      stateRules:contractValue((shared.pseudoStateRules||[]).slice(0,500),"VERIFIED","shared-css.json"),
      tokens:Object.fromEntries(Object.entries(tokenMaps).map(([k,m])=>[k,contractValue(sorted(m),"DERIVED","repeated measured route tokens")]))
    },
    routes,entities,
    coverage:{
      routeTemplates:audit.coverage?.designRouteTemplates??audit.coverage?.canonicalRouteFamilies??routes.length,
      uniqueVisualClusters:audit.coverage?.uniqueVisualClusters??null,
      deepRepresentatives:audit.coverage?.deepRepresentativesScanned??routes.length,
      entityCount:entities.length
    },
    confidence:{
      referenceEvidenceStatus:audit.evidenceStatus||"VERIFIED",
      implementationVisualSimilarityPercent:null,
      targetMappingConfidence:null,
      note:"Implementation similarity is intentionally unset until post-change visual verification."
    }
  };
  await writeJson(outFile,contract);
  return contract;
}
