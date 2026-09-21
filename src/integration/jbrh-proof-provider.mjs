#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const VERSION = '1.0.0';
const FRONT_EXT = /\.(?:js|jsx|ts|tsx|mjs|cjs|vue|svelte|css|scss|sass|less|html)$/i;

function norm(v){ return String(v||'').replaceAll('\\','/').replace(/^\.\//,''); }
function uniq(xs){ return [...new Set(xs.filter(Boolean))]; }
function safeJson(v){ return JSON.stringify(v,null,2); }
function parseArgs(argv){ const out={_:[]}; for(let i=0;i<argv.length;i++){const x=argv[i];if(!x.startsWith('--')){out._.push(x);continue;}const k=x.slice(2);if(i+1<argv.length&&!argv[i+1].startsWith('--'))out[k]=argv[++i];else out[k]=true;} return out; }
function list(v){ if(!v||v===true)return[]; return String(v).split(',').map(x=>x.trim()).filter(Boolean); }
function required(a,k){ if(a[k]===undefined||a[k]===true||!String(a[k]).trim())throw new Error(`--${k} is required`);return String(a[k]); }

export function inferRoutePathFromFile(file){
  let f=norm(file).replace(/\.(?:js|jsx|ts|tsx|mjs|cjs|vue|svelte|html)$/i,'');
  const app=f.match(/(?:^|\/)(?:src\/)?app\/(.+?)(?:\/page)?$/i);
  if(app){
    let parts=app[1].split('/').filter(Boolean);
    if(parts.at(-1)==='page')parts.pop();
    parts=parts.filter(x=>!/^\(.+\)$/.test(x) && !/^@/.test(x));
    parts=parts.map(x=>/^\[\[\.\.\.(.+)\]\]$/.test(x)?'.*':/^\[\.\.\.(.+)\]$/.test(x)?'.+':/^\[(.+)\]$/.test(x)?'[^/]+':x);
    return '/' + parts.join('/');
  }
  const pages=f.match(/(?:^|\/)(?:src\/)?pages\/(.+)$/i);
  if(pages){
    let parts=pages[1].split('/').filter(Boolean);
    if(parts.at(-1)==='index')parts.pop();
    if(parts[0]==='_app'||parts[0]==='_document'||parts[0]==='_error'||parts[0]==='api')return null;
    parts=parts.map(x=>/^\[\[\.\.\.(.+)\]\]$/.test(x)?'.*':/^\[\.\.\.(.+)\]$/.test(x)?'.+':/^\[(.+)\]$/.test(x)?'[^/]+':x);
    return '/' + parts.join('/');
  }
  return null;
}

export function computeAffectedFrontendRoutes(sourceIntelligence, changedFiles, maxNodes=6000){
  const changed=uniq((changedFiles||[]).map(norm)).filter(x=>FRONT_EXT.test(x));
  const reverse=sourceIntelligence?.reverseImportGraph||{};
  const routeSet=new Set((sourceIntelligence?.routeFiles||[]).map(norm));
  const seen=new Set(changed), q=[...changed];
  const affected=new Set(changed.filter(x=>routeSet.has(x)));
  let visited=0;
  while(q.length && visited++<maxNodes){
    const cur=q.shift();
    for(const parent of (reverse[cur]||[]).map(norm)){
      if(routeSet.has(parent))affected.add(parent);
      if(!seen.has(parent)){seen.add(parent);q.push(parent);}
    }
  }
  const routeFiles=[...affected].sort();
  const routePatterns=uniq(routeFiles.map(inferRoutePathFromFile));
  return {changedFrontendFiles:changed,routeFiles,routePatterns,visitedNodes:seen.size,truncated:visited>=maxNodes};
}

export function auditAccessibilitySnapshot(snapshot,{minTouch=44}={}){
  const issues=[];
  const els=Array.isArray(snapshot?.elements)?snapshot.elements:[];
  const add=(rule,severity,selector,detail)=>issues.push({rule,severity,selector:selector||null,detail});
  if(!String(snapshot?.meta?.lang||'').trim())add('document-language','serious','html','html[lang] is missing');
  if(Number(snapshot?.viewport?.horizontalOverflow||0)>0)add('horizontal-overflow','serious','html',`horizontal overflow ${snapshot.viewport.horizontalOverflow}px`);
  const ids=new Map();
  for(const e of els){
    if(e?.id){ if(!ids.has(e.id))ids.set(e.id,[]); ids.get(e.id).push(e.selector); }
    if(e?.interactive && !String(e?.accessibleName||'').trim())add('interactive-name','serious',e.selector,'interactive control has no accessible name');
    if(e?.interactive && e?.rect && (Number(e.rect.width)<minTouch||Number(e.rect.height)<minTouch))add('touch-target','moderate',e.selector,`${e.rect.width}x${e.rect.height}px is below ${minTouch}x${minTouch}px`);
    if(e?.tag==='img' && !String(e?.accessibleName||'').trim())add('image-name','moderate',e.selector,'image has no accessible name/alt evidence');
  }
  for(const [id,selectors] of ids)if(selectors.length>1)add('duplicate-id','serious',selectors[0],`id=${id} occurs ${selectors.length} times`);
  let prev=0;
  for(const e of els.filter(x=>/^h[1-6]$/.test(String(x?.tag||'')))){
    const level=Number(String(e.tag).slice(1));
    if(prev&&level>prev+1)add('heading-order','moderate',e.selector,`heading jumps h${prev} -> h${level}`);
    prev=level;
  }
  return {passed:issues.filter(x=>x.severity==='serious').length===0,issues,summary:{total:issues.length,serious:issues.filter(x=>x.severity==='serious').length,moderate:issues.filter(x=>x.severity==='moderate').length},scope:'deterministic runtime baseline from KK-FRONTEND DOM/geometry evidence; not a full WCAG certification'};
}

export async function auditAccessibility(auditRoot){
  const audit=JSON.parse(await fs.readFile(path.join(auditRoot,'audit.json'),'utf8'));
  const routes=[];
  for(const r of audit.representativeRoutes||[]){
    if(!r.file)continue;
    const route=JSON.parse(await fs.readFile(path.join(auditRoot,r.file),'utf8'));
    for(const vp of route.viewports||[]){
      if(!vp.file)continue;
      const snap=JSON.parse(await fs.readFile(path.join(path.dirname(path.join(auditRoot,r.file)),vp.file),'utf8'));
      routes.push({route:r.url,viewport:vp.profile?.name||`${snap.viewport?.width}x${snap.viewport?.height}`,file:vp.file,...auditAccessibilitySnapshot(snap)});
    }
  }
  const serious=routes.reduce((n,x)=>n+x.summary.serious,0),moderate=routes.reduce((n,x)=>n+x.summary.moderate,0);
  return {schema:'kk-frontend-accessibility-proof/v1',passed:serious===0,routes,summary:{profiles:routes.length,serious,moderate,total:serious+moderate}};
}

async function cmdImpact(a){
  const repo=path.resolve(required(a,'repo')),outDir=path.resolve(a.out||path.join(repo,'.kk-browser-proof-source'));
  await fs.mkdir(outDir,{recursive:true});
  const sourceAuditFile=path.join(outDir,'source-audit.json'),intelligenceFile=path.join(outDir,'source-intelligence.json');
  const { scanSourceProject }=await import('../target/source-scan.mjs');
  const { buildSourceIntelligence }=await import('../target/source-intelligence.mjs');
  const sourceAudit=await scanSourceProject(repo,sourceAuditFile);
  const intelligence=await buildSourceIntelligence(repo,sourceAudit,intelligenceFile);
  const impact=computeAffectedFrontendRoutes(intelligence,list(a.changed));
  const result={schema:'kk-frontend-jbrh-impact/v1',providerVersion:VERSION,repo,sourceAuditFile,intelligenceFile,...impact};
  await fs.writeFile(path.join(outDir,'impact.json'),safeJson(result)+'\n');
  console.log(safeJson(result));return 0;
}

async function cmdScan(a){
  const outDir=path.resolve(required(a,'out'));
  const { scanWebsite }=await import('../browser/scanner.mjs');
  const audit=await scanWebsite({url:required(a,'url'),outDir,mode:String(a.mode||'blueprint-fast'),designOnly:a['design-only']!=='false',headless:a.headless!=='false',downloadAssets:a['download-assets']==='true',storageStatePath:a['storage-state']?path.resolve(String(a['storage-state'])):null,includeRoutePattern:String(a['include-route-pattern']||''),excludeRoutePattern:String(a['exclude-route-pattern']||''),resume:a.resume!=='false'});
  const accessibility=await auditAccessibility(outDir);
  await fs.writeFile(path.join(outDir,'accessibility.json'),safeJson(accessibility)+'\n');
  const runtime=audit.runtime||{};
  const result={schema:'kk-frontend-jbrh-browser-proof/v1',providerVersion:VERSION,ok:audit.evidenceStatus==='VERIFIED'&&!audit.cancelled&&Number(audit.coverage?.routeFailures||0)===0,auditFile:path.join(outDir,'audit.json'),accessibilityFile:path.join(outDir,'accessibility.json'),coverage:audit.coverage,runtime:{consoleErrors:(runtime.consoleErrors||[]),networkErrors:(runtime.networkErrors||[])},accessibility};
  await fs.writeFile(path.join(outDir,'jbrh-proof.json'),safeJson(result)+'\n');
  console.log(safeJson(result));return result.ok?0:1;
}

async function cmdCompare(a){
  const out=path.resolve(required(a,'out'));await fs.mkdir(out,{recursive:true});
  const outFile=path.join(out,'comparison.json');
  const { buildComparison }=await import('../intelligence/compare.mjs');
  const comparison=await buildComparison({referenceRoot:path.resolve(required(a,'reference-root')),targetRoot:path.resolve(required(a,'target-root')),outFile});
  const meaningful=(comparison.entries||[]).filter(e=>!(e.category==='Routes'&&e.difference==='Exact path match'));
  const maxPixel=Number(a['max-pixel-mismatch']??2.5);
  const badPixels=(comparison.visualDiffs||[]).filter(v=>Number(v.pct||0)>maxPixel);
  const result={schema:'kk-frontend-jbrh-visual-proof/v1',providerVersion:VERSION,ok:meaningful.length===0&&badPixels.length===0,comparisonFile:outFile,differences:meaningful.length,visualDiffs:comparison.visualDiffs||[],maxPixelMismatchPercent:maxPixel,badPixelDiffs:badPixels};
  console.log(safeJson(result));return result.ok?0:1;
}

function capabilities(){return{schema:'kk-frontend-jbrh-capabilities/v1',providerVersion:VERSION,capabilities:{playwright:true,routeDiscovery:true,routeTemplateCollapse:true,responsiveBreakpoints:true,screenshots:true,visualDiff:true,domGeometry:true,interactionStates:['hover','focus'],consoleCapture:true,networkFailures:true,sourceImpactGraph:true,accessibilityBaseline:true,designExtraction:true,reports:true,multiBrowser:false,writeJourneys:false},note:'Multi-browser and state-changing E2E journeys are intentionally owned by the JBRH browser probe; KK-FRONTEND remains the forensic scanner/visual sensor.'};}

async function selftest(){
  const graph={routeFiles:['src/app/a/page.tsx','src/app/b/page.tsx'],reverseImportGraph:{'src/ui/Button.tsx':['src/app/a/page.tsx'],'src/lib/x.ts':['src/ui/Button.tsx','src/app/b/page.tsx']}};
  const i=computeAffectedFrontendRoutes(graph,['src/lib/x.ts']);
  if(i.routeFiles.join(',')!=='src/app/a/page.tsx,src/app/b/page.tsx')throw new Error('impact traversal failed');
  if(inferRoutePathFromFile('src/app/accounts/[id]/page.tsx')!=='/accounts/[^/]+')throw new Error('app route inference failed');
  if(inferRoutePathFromFile('src/pages/settings/index.tsx')!=='/settings')throw new Error('pages route inference failed');
  const a=auditAccessibilitySnapshot({meta:{lang:'en'},viewport:{horizontalOverflow:0},elements:[{tag:'button',selector:'#ok',id:'ok',interactive:true,accessibleName:'OK',rect:{width:44,height:44}}]});
  if(!a.passed)throw new Error('clean accessibility fixture failed');
  const b=auditAccessibilitySnapshot({meta:{lang:''},viewport:{horizontalOverflow:3},elements:[{tag:'button',selector:'#x',id:'dup',interactive:true,accessibleName:'',rect:{width:20,height:20}},{tag:'div',selector:'#y',id:'dup',interactive:false,accessibleName:'',rect:{width:1,height:1}}]});
  if(b.passed||b.summary.serious<3)throw new Error('bad accessibility fixture was not rejected');
  console.log(safeJson({ok:true,providerVersion:VERSION,checks:['impact traversal','route inference','accessibility pass/fail'],capabilities:capabilities().capabilities}));return 0;
}

function help(){console.log('jbrh-proof-provider commands: capabilities | impact --repo PATH --changed a,b [--out DIR] | scan --url URL --out DIR [--mode blueprint-fast] | compare --reference-root DIR --target-root DIR --out DIR | selftest');}
export async function main(argv=process.argv.slice(2)){const [cmd,...rest]=argv;if(!cmd||['help','-h','--help'].includes(cmd)){help();return 0;}const a=parseArgs(rest);if(cmd==='capabilities'){console.log(safeJson(capabilities()));return 0;}if(cmd==='impact')return cmdImpact(a);if(cmd==='scan')return cmdScan(a);if(cmd==='compare')return cmdCompare(a);if(cmd==='selftest')return selftest();throw new Error(`unknown command: ${cmd}`);}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){main().then(code=>process.exit(Number(code)||0)).catch(e=>{console.error(safeJson({ok:false,error:String(e?.stack||e)}));process.exit(2);});}
