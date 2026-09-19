import path from "node:path";
import fs from "node:fs/promises";
import { writeJson, safeSlug } from "../fs-utils.mjs";
import { compareScreenshots } from "../browser/scanner.mjs";

function pathName(url){try{return new URL(url).pathname.replace(/\/+$/,"")||"/"}catch{return String(url)}}
function similarity(a,b){
  if(a===b)return 1;
  const aa=a.split("/").filter(Boolean),bb=b.split("/").filter(Boolean);
  const setA=new Set(aa),setB=new Set(bb);
  const inter=[...setA].filter(x=>setB.has(x)).length;
  const union=new Set([...aa,...bb]).size||1;
  return inter/union;
}
function closestRoute(ref,targetRoutes){
  const p=pathName(ref.url);
  const scored=targetRoutes.map(t=>({route:t,score:similarity(p,pathName(t.url))})).sort((a,b)=>b.score-a.score);
  return scored[0]||null;
}
function entry(id, category, subcategory, route, reference, target, difference, evidence, impact="medium", risk="low", extra={}){
  return {id,route,category,subcategory,reference,target,difference,evidence,impact,responsiveImpact:extra.responsiveImpact||"unknown",sourceComponent:extra.sourceComponent||null,targetComponent:extra.targetComponent||null,implementationScope:extra.implementationScope||"frontend",dependencies:extra.dependencies||[],risk,selected:false};
}

function topValues(tokenObj,key,n=12){return (tokenObj?.[key]||[]).slice(0,n).map(x=>x.value)}
function firstRouteFile(root,route){return route?.file?path.join(root,route.file):null}
async function readRoute(root,route){const f=firstRouteFile(root,route);if(!f)return null;try{return JSON.parse(await fs.readFile(f,"utf8"))}catch{return null}}

export async function buildComparison({referenceRoot,targetRoot,outFile,progress=()=>{}}){
  const reference=JSON.parse(await fs.readFile(path.join(referenceRoot,"audit.json"),"utf8"));
  const target=JSON.parse(await fs.readFile(path.join(targetRoot,"audit.json"),"utf8"));
  const entries=[];
  let idn=1;
  const referenceRoutes=(reference.representativeRoutes?.length?reference.representativeRoutes:reference.routes)||[];
  const targetRoutes=(target.representativeRoutes?.length?target.representativeRoutes:target.routes)||[];
  progress({stage:"compare:routes",progress:10,message:"Mapping routes"});
  for(const rr of referenceRoutes){
    const match=closestRoute(rr,targetRoutes);
    entries.push(entry(`cmp-${idn++}`,"Routes","Route mapping",rr.url,rr.url,match?.route?.url||null,
      match?.score===1?"Exact path match":match?`Closest route similarity ${(match.score*100).toFixed(0)}%`:"No target route",
      {status:"VERIFIED",referenceFile:rr.file,targetFile:match?.route?.file||null},
      match?.score>=.8?"low":"high","medium",{responsiveImpact:"route-level"}));
  }

  progress({stage:"compare:design",progress:30,message:"Comparing route design systems"});
  for(const rr of referenceRoutes){
    const match=closestRoute(rr,targetRoutes); if(!match)continue;
    const [ra,ta]=await Promise.all([readRoute(referenceRoot,rr),readRoute(targetRoot,match.route)]);
    if(!ra||!ta)continue;
    const refTokens=ra.designTokens||{},tarTokens=ta.designTokens||{};
    for(const key of ["colors","fontSizes","fontFamilies","radii","spacing"]){
      const a=topValues(refTokens,key),b=topValues(tarTokens,key);
      if(JSON.stringify(a)!==JSON.stringify(b)){
        entries.push(entry(`cmp-${idn++}`,"Design Tokens",key,rr.url,a,b,
          "Observed token-frequency sets differ",
          {status:"VERIFIED",referenceRoute:rr.file,targetRoute:match.route.file},
          "high","low",{responsiveImpact:"shared"}));
      }
    }

    const refVp=new Map((ra.viewports||[]).map(v=>[`${v.profile.width}x${v.profile.height}`,v]));
    const tarVp=new Map((ta.viewports||[]).map(v=>[`${v.profile.width}x${v.profile.height}`,v]));
    for(const [k,rv] of refVp){
      const tv=tarVp.get(k); if(!tv)continue;
      const rc=rv.counts||{},tc=tv.counts||{};
      for(const metric of ["rendered","controls","buttons","links","inputs","headings","fixed","sticky","smallTouchTargets"]){
        if(rc[metric]!==tc[metric]){
          entries.push(entry(`cmp-${idn++}`,"Layout/Elements",metric,rr.url,rc[metric],tc[metric],
            `${metric} count differs at ${k}`,
            {status:"VERIFIED",viewport:k,referenceProfile:rv.file,targetProfile:tv.file},
            metric==="smallTouchTargets"?"high":"medium","low",{responsiveImpact:k}));
        }
      }
      if(rv.viewport?.horizontalOverflow!==tv.viewport?.horizontalOverflow){
        entries.push(entry(`cmp-${idn++}`,"Responsive Design","Horizontal overflow",rr.url,rv.viewport?.horizontalOverflow,tv.viewport?.horizontalOverflow,
          `Overflow differs at ${k}`,{status:"VERIFIED",viewport:k},"high","medium",{responsiveImpact:k}));
      }
    }
  }

  // Screenshot diffs where corresponding profile file paths exist.
  progress({stage:"compare:visual",progress:65,message:"Creating visual diffs where screenshots align"});
  const visualDiffs=[];
  for(const rr of referenceRoutes.slice(0,30)){
    const match=closestRoute(rr,targetRoutes); if(!match)continue;
    const [ra,ta]=await Promise.all([readRoute(referenceRoot,rr),readRoute(targetRoot,match.route)]);
    if(!ra||!ta)continue;
    const tar=new Map((ta.viewports||[]).map(v=>[`${v.profile.width}x${v.profile.height}`,v]));
    for(const rv of (ra.viewports||[]).filter(v=>["phone-390x844","desktop-1440x900"].includes(v.profile?.name))){
      const tv=tar.get(`${rv.profile.width}x${rv.profile.height}`); if(!tv?.screenshot||!rv.screenshot)continue;
      const refRouteDir=path.dirname(path.join(referenceRoot,rr.file));
      const tarRouteDir=path.dirname(path.join(targetRoot,match.route.file));
      const refP=path.join(refRouteDir,rv.screenshot),tarP=path.join(tarRouteDir,tv.screenshot);
      const out=path.join(path.dirname(outFile),"visual-diffs",`${safeSlug(pathName(rr.url))}-${rv.profile.width}x${rv.profile.height}.png`);
      try{
        const stats=await compareScreenshots(refP,tarP,out);
        visualDiffs.push({
          route:rr.url,targetRoute:match.route.url,viewport:`${rv.profile.width}x${rv.profile.height}`,
          referenceScreenshot:path.relative(path.dirname(outFile),refP).split(path.sep).join("/"),
          targetScreenshot:path.relative(path.dirname(outFile),tarP).split(path.sep).join("/"),
          diffScreenshot:path.relative(path.dirname(outFile),out).split(path.sep).join("/"),
          ...stats
        });
      }catch{}
    }
  }

  const result={schema:"kk-frontend-comparison/v1",createdAt:new Date().toISOString(),reference:reference.target,target:target.target,entries,visualDiffs};
  await writeJson(outFile,result);
  progress({stage:"compare:done",progress:100,message:`Comparison complete: ${entries.length} differences`});
  return result;
}
