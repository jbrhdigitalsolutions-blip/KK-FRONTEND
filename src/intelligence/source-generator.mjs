import fs from "node:fs/promises";
import path from "node:path";
import { writeJson } from "../fs-utils.mjs";

const CSS_KEYS=[
  "display","visibility","opacity","position","z-index","overflow","overflow-x","overflow-y","box-sizing",
  "width","height","min-width","min-height","max-width","max-height","top","right","bottom","left","inset",
  "margin-top","margin-right","margin-bottom","margin-left","padding-top","padding-right","padding-bottom","padding-left",
  "gap","row-gap","column-gap","flex","flex-basis","flex-grow","flex-shrink","flex-direction","flex-wrap",
  "justify-content","align-items","align-content","align-self","order","grid-template-columns","grid-template-rows",
  "grid-auto-flow","grid-column","grid-row","font-family","font-size","font-weight","font-style","line-height",
  "letter-spacing","word-spacing","text-align","text-transform","text-decoration-line","white-space","word-break",
  "text-overflow","color","background-color","background-image","border-top-width","border-right-width",
  "border-bottom-width","border-left-width","border-top-color","border-right-color","border-bottom-color",
  "border-left-color","border-top-left-radius","border-top-right-radius","border-bottom-right-radius",
  "border-bottom-left-radius","outline-color","outline-width","outline-style","box-shadow","filter","backdrop-filter",
  "transform","transform-origin","clip-path","transition-property","transition-duration","transition-delay",
  "transition-timing-function","animation-name","animation-duration","animation-delay","animation-timing-function",
  "animation-iteration-count","animation-direction","animation-fill-mode","animation-play-state","cursor","pointer-events",
  "user-select","touch-action","scroll-behavior","scroll-snap-type","scroll-snap-align","overscroll-behavior",
  "object-fit","object-position","aspect-ratio"
];

function slug(s){return String(s||"item").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48)||"item"}
function cssDecls(style={}){
  return CSS_KEYS.filter(k=>style[k]&&style[k]!=="initial").map(k=>`  ${k}: ${style[k]};`).join("\n");
}
function escText(s){return String(s||"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}
function frameworkOf(sourceAudit){
  const names=(sourceAudit?.technology||[]).map(x=>String(x.name||"").toLowerCase());
  if(names.some(x=>x.includes("next")||x==="react"))return"react";
  if(names.some(x=>x.includes("vue")||x.includes("nuxt")))return"vue";
  if(names.some(x=>x.includes("svelte")))return"svelte";
  return"html";
}
function tagFor(e){
  if(e.type==="section")return e.tag&&["header","nav","main","section","article","aside","footer"].includes(e.tag)?e.tag:"section";
  if(e.type==="text")return e.tag&&/^h[1-6]$|^p$|^label$|^blockquote$|^small$/.test(e.tag)?e.tag:"p";
  if(e.tag&&["button","a","img","video","form","input","textarea","select"].includes(e.tag))return e.tag;
  return"div";
}
function literal(e,includeLiteralText){
  if(!includeLiteralText)return e.type==="text"?"Your text":"";
  return escText(e.text||e.accessibleName||"");
}
function animationCss(entity,className,index){
  const frames=entity.animation?.keyframes||[];
  if(!frames.length)return"";
  const name=`kkRefAnim${index+1}`;
  const frameCss=frames.map((f,i)=>{
    const pct=Number.isFinite(Number(f.offset))?Math.round(Number(f.offset)*100):Math.round((i/Math.max(frames.length-1,1))*100);
    const props=Object.entries(f).filter(([k])=>!["offset","easing","composite","computedOffset"].includes(k)).map(([k,v])=>`    ${k.replace(/[A-Z]/g,m=>"-"+m.toLowerCase())}: ${v};`).join("\n");
    return `  ${pct}% {\n${props}\n  }`;
  }).join("\n");
  const t=entity.animation?.timing||{};
  const duration=typeof t.duration==="number"?`${t.duration}ms`:(t.duration||"1s");
  const easing=t.easing||"linear";
  const iterations=t.iterations===Infinity?"infinite":(t.iterations??1);
  return `@keyframes ${name} {\n${frameCss}\n}\n.${className} { animation: ${name} ${duration} ${easing} ${iterations}; }\n`;
}
function sourceHints(sourceAudit,selected){
  if(!sourceAudit)return[];
  const needles=new Set(selected.flatMap(e=>[e.tag,e.type,...String(e.title||"").toLowerCase().split(/[^a-z0-9]+/)]).filter(x=>String(x||"").length>=3));
  const files=[...(sourceAudit.componentFiles||[]),...(sourceAudit.styleFiles||[])];
  return files.map(file=>{
    const low=file.toLowerCase();let score=0;
    for(const n of needles)if(low.includes(String(n).toLowerCase()))score++;
    return{file,score};
  }).sort((a,b)=>b.score-a.score||a.file.localeCompare(b.file)).slice(0,20);
}
function reactMarkup(items,includeLiteralText){
  return items.map(({e,className})=>{
    const tag=tagFor(e),text=literal(e,includeLiteralText);
    if(tag==="img")return`      <img className="${className}" alt="" />`;
    return`      <${tag} className="${className}">${text||"{/* target content */}"}</${tag}>`;
  }).join("\n");
}
function htmlMarkup(items,includeLiteralText){
  return items.map(({e,className})=>{
    const tag=tagFor(e),text=literal(e,includeLiteralText);
    if(tag==="img")return`  <img class="${className}" alt="">`;
    return`  <${tag} class="${className}">${text||"<!-- target content -->"}</${tag}>`;
  }).join("\n");
}

export async function generateSelectionSource({catalog,entityIds,outDir,targetSourceAudit=null,options={}}){
  const wanted=new Set(entityIds||[]);
  const selected=(catalog?.entities||[]).filter(e=>wanted.has(e.id));
  if(!selected.length)throw new Error("Select at least one reference design entity.");
  await fs.mkdir(outDir,{recursive:true});
  const framework=frameworkOf(targetSourceAudit);
  const includeLiteralText=options.includeLiteralText===true;

  const items=selected.map((e,i)=>({e,className:`kk-ref-${slug(e.type)}-${String(i+1).padStart(2,"0")}`}));
  let css="/* KK-FRONTEND v0.3.0 — runtime-evidence reconstruction. Not original third-party source. */\n\n";
  items.forEach(({e,className},i)=>{
    css+=`/* ${e.type}: ${String(e.title||e.selector||"").replace(/\*\//g,"")} | ${e.route} | ${e.viewport?.name||""} */\n.${className} {\n${cssDecls(e.style)}\n}\n\n`;
    if(e.type==="animation")css+=animationCss(e,className,i)+"\n";
  });

  let componentFile="selection.html",component="";
  if(framework==="react"){
    componentFile="ReferenceDesignSelection.jsx";
    component=`import "./reference-design-selection.css";\n\nexport default function ReferenceDesignSelection(){\n  return (\n    <div className="kk-reference-selection">\n${reactMarkup(items,includeLiteralText)}\n    </div>\n  );\n}\n`;
  }else if(framework==="vue"){
    componentFile="ReferenceDesignSelection.vue";
    component=`<template>\n<div class="kk-reference-selection">\n${htmlMarkup(items,includeLiteralText)}\n</div>\n</template>\n\n<style src="./reference-design-selection.css"></style>\n`;
  }else if(framework==="svelte"){
    componentFile="ReferenceDesignSelection.svelte";
    component=`<svelte:head></svelte:head>\n<div class="kk-reference-selection">\n${htmlMarkup(items,includeLiteralText)}\n</div>\n<style>\n@import './reference-design-selection.css';\n</style>\n`;
  }else{
    component=`<link rel="stylesheet" href="./reference-design-selection.css">\n<div class="kk-reference-selection">\n${htmlMarkup(items,includeLiteralText)}\n</div>\n`;
  }

  await fs.writeFile(path.join(outDir,"reference-design-selection.css"),css,"utf8");
  await fs.writeFile(path.join(outDir,componentFile),component,"utf8");

  const generation={
    schema:"kk-frontend-generated-source/v1",
    createdAt:new Date().toISOString(),
    mode:"runtime-evidence-reconstruction",
    framework,
    sourceClaim:"Generated equivalent implementation from VERIFIED rendered evidence; not the reference site's original proprietary source.",
    selectedEntityIds:selected.map(e=>e.id),
    selected: selected.map(e=>({id:e.id,type:e.type,route:e.route,viewport:e.viewport,title:e.title,selector:e.selector,evidence:e.evidence})),
    files:[
      {path:"reference-design-selection.css",kind:"style"},
      {path:componentFile,kind:"component"}
    ],
    targetHints:sourceHints(targetSourceAudit,selected),
    options:{includeLiteralText},
    preview:{css,componentFile,component}
  };
  await writeJson(path.join(outDir,"generation.json"),generation);
  return generation;
}
