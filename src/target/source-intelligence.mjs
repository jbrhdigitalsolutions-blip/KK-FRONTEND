import fs from "node:fs/promises";
import path from "node:path";
import { listFiles, rel, writeJson, sha256File } from "../fs-utils.mjs";

const FRONT_EXT = new Set([".js",".jsx",".ts",".tsx",".mjs",".cjs",".css",".scss",".sass",".less",".html",".vue",".svelte"]);
const COMPONENT_EXT = new Set([".jsx",".tsx",".vue",".svelte"]);
const STYLE_EXT = new Set([".css",".scss",".sass",".less"]);
const RESOLVE_EXT = [".js",".jsx",".ts",".tsx",".mjs",".cjs",".vue",".svelte",".css",".scss",".sass",".less"];
const STOP_WORDS = new Set(["src","app","page","pages","component","components","index","main","view","views","screen","screens","ui","the","and","with"]);

function words(v){return [...new Set(String(v||"").toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>=3&&!STOP_WORDS.has(x)))]}
async function readText(file,max=2_000_000){const b=await fs.readFile(file);return b.length>max?"":b.toString("utf8")}
function extractImports(txt){
  const out=[];
  for(const re of [
    /\bimport\s+(?:[^"'\n]+?\s+from\s+)?["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g
  ]) for(const m of txt.matchAll(re)) out.push(m[1]);
  return [...new Set(out)];
}
function extractExports(txt){
  const out=[];
  for(const m of txt.matchAll(/\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g))out.push(m[1]);
  for(const m of txt.matchAll(/\bexport\s*\{([^}]+)\}/g)){
    for(const part of m[1].split(",")){const n=part.trim().split(/\s+as\s+/i).pop();if(n)out.push(n.trim())}
  }
  return [...new Set(out)];
}
function componentName(file,txt){
  const direct=txt.match(/\bexport\s+default\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/)?.[1];
  if(direct)return direct;
  const named=extractExports(txt).find(x=>/^[A-Z]/.test(x));
  if(named)return named;
  const base=path.basename(file,path.extname(file)).replace(/[^A-Za-z0-9_$]+/g," ");
  return base.split(/\s+/).filter(Boolean).map(x=>x[0]?.toUpperCase()+x.slice(1)).join("")||"AnonymousComponent";
}
function inferRoles(file,txt){
  const sample=(file+" "+txt.slice(0,120000)).toLowerCase();
  const checks=[
    ["sidebar",/sidebar|side-nav|sidenav/],["navigation",/\bnav\b|navigation|menu-item/],["header",/\bheader\b|topbar|appbar/],
    ["footer",/\bfooter\b/],["card",/\bcard\b|tile/],["button",/\bbutton\b|iconbutton|cta/],["form",/\bform\b|onsubmit|input|textarea/],
    ["table",/\btable\b|datagrid|grid-row/],["dialog",/dialog|modal|drawer|sheet|popover/],["dashboard",/dashboard|workspace/],
    ["list",/\blist\b|listitem|row-item/],["detail",/detail|profile|record-view/],["hero",/\bhero\b/],["search",/search|combobox/]
  ];
  return checks.filter(([,re])=>re.test(sample)).map(([name])=>name);
}
function riskSignals(txt){
  const checks={
    api:/\bfetch\s*\(|\baxios\.|\/api\/|useQuery\s*\(|useMutation\s*\(/,
    auth:/\bauth\b|permission|authorize|session|token/,
    state:/useState\s*\(|useReducer\s*\(|createContext\s*\(|redux|zustand|mobx/,
    routing:/useRouter\s*\(|useNavigate\s*\(|router\.|navigate\s*\(|<Route\b|href\s*=/,
    forms:/onSubmit\s*=|handleSubmit|formAction|<form\b/,
    analytics:/analytics|gtag\s*\(|segment\.|mixpanel|posthog/
  };
  return Object.fromEntries(Object.entries(checks).map(([k,re])=>[k,re.test(txt)]));
}
function riskLevel(signals){
  if(signals.api||signals.auth||signals.forms)return"high";
  if(signals.state||signals.routing||signals.analytics)return"medium";
  return"low";
}
function resolveImport(fromRel,spec,fileSet){
  if(!spec.startsWith("."))return null;
  const base=path.posix.normalize(path.posix.join(path.posix.dirname(String(fromRel).replaceAll("\\","/")),spec));
  const candidates=[base,...RESOLVE_EXT.map(ext=>base+ext),...RESOLVE_EXT.map(ext=>base+"/index"+ext)];
  return candidates.find(x=>fileSet.has(x))||null;
}
function isRouteFile(r,sourceAudit){
  if((sourceAudit?.routeFiles||[]).includes(r))return true;
  return /(?:^|\/)(?:app|pages|routes|router)(?:\/|$)/i.test(r);
}
function isComponentFile(r,ext,txt,sourceAudit){
  if((sourceAudit?.componentFiles||[]).includes(r))return true;
  if(COMPONENT_EXT.has(ext))return true;
  return /(?:^|\/)(?:components|ui|views|screens)(?:\/|$)/i.test(r)&&/\b(?:function|const|class)\s+[A-Z]/.test(txt);
}

export async function buildSourceIntelligence(root,sourceAudit,outFile,{progress=()=>{}}={}){
  progress({stage:"source:intelligence",progress:72,message:"Building source-aware component and risk graph"});
  const all=await listFiles(root,{maxFiles:30000});
  const frontend=all.filter(f=>FRONT_EXT.has(path.extname(f).toLowerCase()));
  const rels=frontend.map(f=>rel(root,f));
  const fileSet=new Set(rels);
  const files=[];
  let i=0;
  for(const abs of frontend){
    i++;
    const r=rel(root,abs),ext=path.extname(abs).toLowerCase(),txt=await readText(abs);
    if(!txt)continue;
    const imports=extractImports(txt);
    const resolvedImports=imports.map(spec=>({spec,target:resolveImport(r,spec,fileSet)}));
    const signals=riskSignals(txt);
    const handlers=[...new Set([...txt.matchAll(/\b(on[A-Z][A-Za-z0-9_$]*)\s*=/g)].map(m=>m[1]))].slice(0,80);
    const styleImports=resolvedImports.filter(x=>x.target&&STYLE_EXT.has(path.extname(x.target).toLowerCase())).map(x=>x.target);
    files.push({
      path:r,sha256:await sha256File(abs),bytes:(await fs.stat(abs)).size,ext,
      imports,resolvedImports,exports:extractExports(txt),styleImports,handlers,
      roles:inferRoles(r,txt),riskSignals:signals,risk:riskLevel(signals),
      routeFile:isRouteFile(r,sourceAudit),componentFile:isComponentFile(r,ext,txt,sourceAudit),
      tokenFile:/token|theme|design-system|variables/i.test(r)||Boolean((sourceAudit?.tokenFiles||[]).includes(r))
    });
    if(i%150===0)progress({stage:"source:intelligence",progress:72+Math.min(16,Math.round((i/frontend.length)*16)),message:"Source intelligence "+i+"/"+frontend.length});
  }
  const byPath=new Map(files.map(x=>[x.path,x]));
  const reverse=new Map(files.map(x=>[x.path,[]]));
  for(const f of files)for(const x of f.resolvedImports||[])if(x.target&&reverse.has(x.target))reverse.get(x.target).push(f.path);
  const componentRows=[];
  for(const f of files.filter(x=>x.componentFile)){
    const abs=path.join(root,...f.path.split("/")),txt=await readText(abs),name=componentName(f.path,txt);
    componentRows.push({
      id:"cmp:"+f.path,name,path:f.path,sha256:f.sha256,roles:f.roles,
      exports:f.exports,styleImports:f.styleImports,handlers:f.handlers,risk:f.risk,riskSignals:f.riskSignals,
      usedBy:[...new Set(reverse.get(f.path)||[])],usedByRoutes:[...new Set((reverse.get(f.path)||[]).filter(p=>byPath.get(p)?.routeFile))],
      semanticTokens:words(name+" "+f.path+" "+f.roles.join(" "))
    });
  }
  const result={
    schema:"kk-frontend-source-intelligence/v1",createdAt:new Date().toISOString(),root,
    baseline:{gitHead:sourceAudit?.git?.head||null,gitBranch:sourceAudit?.git?.branch||null,gitClean:sourceAudit?.git?.clean??null},
    technology:sourceAudit?.technology||[],packageManager:sourceAudit?.packageManager||null,
    counts:{frontendFiles:files.length,components:componentRows.length,highRiskFiles:files.filter(x=>x.risk==="high").length,styleFiles:files.filter(x=>STYLE_EXT.has(x.ext)).length,routeFiles:files.filter(x=>x.routeFile).length},
    files,components:componentRows,
    routeFiles:files.filter(x=>x.routeFile).map(x=>x.path),
    styleFiles:files.filter(x=>STYLE_EXT.has(x.ext)).map(x=>x.path),
    tokenFiles:files.filter(x=>x.tokenFile).map(x=>x.path),
    importGraph:Object.fromEntries(files.map(x=>[x.path,(x.resolvedImports||[]).filter(y=>y.target).map(y=>y.target)])),
    reverseImportGraph:Object.fromEntries([...reverse.entries()].map(([k,v])=>[k,[...new Set(v)]])),
    evidenceStatus:"VERIFIED"
  };
  await writeJson(outFile,result);
  progress({stage:"source:intelligence:done",progress:90,message:"Source-aware component map ready"});
  return result;
}
