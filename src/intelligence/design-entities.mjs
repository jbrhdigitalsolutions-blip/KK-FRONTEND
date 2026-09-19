import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { writeJson } from "../fs-utils.mjs";

const SECTION_TAGS=new Set(["header","nav","main","section","article","aside","footer"]);
const TEXT_TAGS=new Set(["h1","h2","h3","h4","h5","h6","p","label","blockquote","figcaption","li","dt","dd","small","strong"]);
const COMPONENT_TAGS=new Set(["button","a","input","textarea","select","form","figure","article","dialog","details","summary","img","svg","video","canvas"]);

function stableId(parts){
  return "ref-"+crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0,16);
}
function norm(p){return String(p||"").split(path.sep).join("/")}
function readJson(file){return fs.readFile(file,"utf8").then(JSON.parse)}
function depth(selector){return String(selector||"").split(">").length}
function classHint(el){return (el.classes||[]).join(" ")}
function titleFor(el,type){
  const text=String(el.accessibleName||el.text||"").replace(/\s+/g," ").trim();
  if(text)return text.slice(0,96);
  if(el.id)return `#${el.id}`;
  const cls=(el.classes||[]).slice(0,2).join(".");
  return cls?`${el.tag}.${cls}`:`${type} ${el.tag}`;
}
function styleOf(snapshot,el){return snapshot.styles?.[el.styleId]||{}}
function isSection(el,viewport){
  if(SECTION_TAGS.has(el.tag))return true;
  if(["banner","navigation","main","complementary","contentinfo","region"].includes(String(el.role||"").toLowerCase()))return true;
  const r=el.rect||{};
  const large=(r.width||0)>=(viewport.width||1)*0.68&&(r.height||0)>=Math.max(120,(viewport.height||1)*0.14);
  const hinted=/(hero|section|shell|banner|feature|pricing|testimonial|footer|header|content|gallery|grid|showcase|cta)/i.test(classHint(el));
  return el.tag==="div"&&large&&(hinted||depth(el.selector)<=5);
}
function isText(el){
  const t=String(el.text||"").trim();
  return !!t&&(TEXT_TAGS.has(el.tag)||String(el.role||"").toLowerCase()==="heading");
}
function isComponent(el){
  if(el.interactive||COMPONENT_TAGS.has(el.tag))return true;
  return /(card|tile|button|control|menu|dialog|modal|drawer|tabs?|carousel|slider|search|composer|avatar|badge|chip|toolbar|nav-item)/i.test(classHint(el));
}
function evidence(type,routeFile,profileFile){
  return [
    {status:"VERIFIED",source:"DOM/runtime snapshot",routeFile,profileFile},
    {status:"VERIFIED",source:"getComputedStyle + DOMRect",routeFile,profileFile},
    ...(type==="animation"?[{status:"VERIFIED",source:"Web Animations API",routeFile,profileFile}]:[])
  ];
}
function entityFromElement({route,routeFile,routeDir,summary,snapshot,el,type}){
  const vp=summary.profile||snapshot.profile||{};
  const screenshot=summary.screenshot?norm(path.join(routeDir,summary.screenshot)):null;
  return {
    id:stableId([route.url,vp.name||`${vp.width}x${vp.height}`,type,el.selector||String(el.index)]),
    type,
    route:route.url,
    routeFile:norm(routeFile),
    viewport:{name:vp.name||null,width:vp.width||snapshot.viewport?.width||null,height:vp.height||snapshot.viewport?.height||null,source:vp.source||null},
    documentViewport:snapshot.viewport||null,
    screenshot,
    selector:el.selector||null,
    parentSelector:el.parentSelector||null,
    elementIndex:el.index,
    tag:el.tag||null,
    role:el.role||null,
    title:titleFor(el,type),
    text:String(el.text||"").replace(/\s+/g," ").trim().slice(0,2000),
    accessibleName:el.accessibleName||null,
    interactive:!!el.interactive,
    rect:el.rect||null,
    style:styleOf(snapshot,el),
    attrs:el.attrs||{},
    pseudo:el.pseudo||{},
    evidence:evidence(type,norm(routeFile),norm(path.join(routeDir,summary.file)))
  };
}
function dedupe(entities){
  const seen=new Set(),out=[];
  for(const e of entities){
    const k=[e.route,e.viewport?.name,e.type,e.selector,e.animation?.id||""].join("|");
    if(seen.has(k))continue;seen.add(k);out.push(e);
  }
  return out;
}

export async function buildReferenceEntityCatalog({referenceRoot,outFile}){
  const audit=await readJson(path.join(referenceRoot,"audit.json"));
  const routes=(audit.representativeRoutes?.length?audit.representativeRoutes:audit.routes)||[];
  const entities=[];
  const routeSummaries=[];

  for(const route of routes){
    if(!route?.file)continue;
    const routeFile=path.join(referenceRoot,route.file);
    let routeData;
    try{routeData=await readJson(routeFile)}catch{continue}
    const routeDir=path.dirname(route.file);
    const viewports=[];

    for(const summary of routeData.viewports||[]){
      if(!summary?.file)continue;
      const profileFile=path.join(referenceRoot,routeDir,summary.file);
      let snapshot;
      try{snapshot=await readJson(profileFile)}catch{continue}
      const vp=summary.profile||snapshot.profile||{};
      const before=entities.length;

      for(const el of snapshot.elements||[]){
        if(isSection(el,snapshot.viewport||vp))entities.push(entityFromElement({route,routeFile:route.file,routeDir,summary,snapshot,el,type:"section"}));
        if(isText(el))entities.push(entityFromElement({route,routeFile:route.file,routeDir,summary,snapshot,el,type:"text"}));
        if(isComponent(el))entities.push(entityFromElement({route,routeFile:route.file,routeDir,summary,snapshot,el,type:"component"}));
      }

      for(const anim of snapshot.runtimeAnimations||[]){
        const target=(snapshot.elements||[]).find(e=>e.selector===anim.target)||null;
        if(!target)continue;
        const base=entityFromElement({route,routeFile:route.file,routeDir,summary,snapshot,el:target,type:"animation"});
        entities.push({
          ...base,
          id:stableId([route.url,vp.name||"", "animation",anim.target||"",anim.id||JSON.stringify(anim.timing||{})]),
          title:`Animation — ${base.title}`,
          animation:{id:anim.id||null,playState:anim.playState||null,playbackRate:anim.playbackRate??null,currentTime:anim.currentTime??null,timing:anim.timing||null,keyframes:anim.keyframes||[]}
        });
      }

      viewports.push({
        name:vp.name||null,
        width:vp.width||snapshot.viewport?.width||null,
        height:vp.height||snapshot.viewport?.height||null,
        scrollHeight:snapshot.viewport?.scrollHeight||null,
        screenshot:summary.screenshot?norm(path.join(routeDir,summary.screenshot)):null,
        entities:entities.length-before
      });
    }

    routeSummaries.push({url:route.url,file:norm(route.file),viewports});
  }

  const finalEntities=dedupe(entities);
  const counts=finalEntities.reduce((acc,e)=>{acc[e.type]=(acc[e.type]||0)+1;return acc},{});
  const catalog={
    schema:"kk-frontend-reference-entities/v1",
    createdAt:new Date().toISOString(),
    reference:audit.target,
    evidenceStatus:"VERIFIED_RUNTIME_RECONSTRUCTION",
    note:"Entities describe observed rendered design evidence. They are not the reference site's proprietary original source code.",
    routes:routeSummaries,
    counts:{total:finalEntities.length,...counts},
    entities:finalEntities
  };
  await writeJson(outFile,catalog);
  return catalog;
}

export function selectEntities(catalog,ids=[]){
  const wanted=new Set(ids);
  return (catalog?.entities||[]).filter(e=>wanted.has(e.id));
}
