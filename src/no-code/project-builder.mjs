import { analyzeProjectIntake, normalizeProjectFiles } from "./project-intake.mjs";
import { classifyCandidate } from "../reference-design/design-md.mjs";

const arr=v=>Array.isArray(v)?v:[];
const str=(v,f="")=>String(v??"").trim()||f;
const num=v=>Number.isFinite(Number(v))?Number(v):null;
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const css=v=>String(v??"").replace(/[{};]/g,"").trim();
const slug=v=>str(v,"design-build").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,52)||"design-build";
const vp=(e,n)=>arr(e?.viewports).find(v=>v.name===n)||{};
const nodes=v=>[...arr(v?.scopes),...arr(v?.representativeElements)];

function parseEvidence(input){
  const e=typeof input==="string"?JSON.parse(input):input;
  if(e?.schema!=="kk-reference-design-evidence-compact/v2") throw new Error("Project-aware build requires DESIGN-EVIDENCE.json.");
  return e;
}
function kind(node){
  return classifyCandidate({
    tag:node?.tag,role:node?.role,className:node?.className,label:node?.label,
    interactive:node?.interactive,
    animation:node?.style?.animationName&&node.style.animationName!=="none"
  });
}
function label(v){
  const x=str(v).replace(/\s+/g," ");
  return !x||/^(div|span|section|main|body|img|svg|button|input|a)$/i.test(x)?"":x.slice(0,180);
}
function usable(node){
  const k=kind(node),r=node?.rect||{};
  if(!num(r.width)||!num(r.height)||r.width<8||r.height<8)return false;
  return ["Typography","Button","Input","Search","Image","Video","Logo","Icon","Badge","Avatar","Tabs","Navigation","Form"].includes(k)
    || Boolean(node?.interactive)||(/^h[1-6]$|^p$|^a$|^label$/i.test(node?.tag||""));
}
const find=(v,s)=>nodes(v).find(x=>x.selector===s)||null;

function selectedRoots(e){
  const d=vp(e,"desktop"),all=nodes(d),sel=arr(e.capture?.selection);
  if(e.capture?.scope==="whole"||!sel.length){
    return [all.find(x=>x.selector==="body")||d.scopes?.[0]||{
      selector:"body",tag:"body",rect:{x:0,y:0,width:d.viewport?.width||1440,height:d.document?.height||1200},style:{}
    }];
  }
  const out=sel.map(s=>all.find(x=>x.selector===s.selector)).filter(Boolean);
  return out.length?out:[d.scopes?.[0]].filter(Boolean);
}
function relativeRect(child,parent){
  const c=child?.rect||{},p=parent?.rect||{},pw=num(p.width)||1440,ph=num(p.height)||900;
  return {
    left:(((num(c.x)||0)-(num(p.x)||0))/pw)*100,
    top:(((num(c.y)||0)-(num(p.y)||0))/ph)*100,
    width:((num(c.width)||0)/pw)*100,
    height:((num(c.height)||0)/ph)*100
  };
}
function contentFor(node,answers,intake,index){
  const k=kind(node),provided=answers?.content||{},strategy=answers?.contentStrategy;
  const snippets=arr(intake?.content?.snippets);
  if(k==="Typography"){
    if(strategy==="provided") return str(provided["text-"+(index+1)])||str(provided["text-1"])||"Project text";
    if(strategy==="project") return snippets[index%Math.max(1,snippets.length)]?.text||label(node.label)||"Project text";
    return label(node.label)||"Project text";
  }
  if(k==="Button"){
    if(strategy==="provided") return str(provided["action-"+(index+1)])||str(provided["action-1"])||"Action";
    if(strategy==="project") return snippets.find(x=>/start|join|create|book|contact|learn|buy|try|sign|login|log in/i.test(x.text))?.text||label(node.label)||"Action";
    return label(node.label)||"Action";
  }
  if(["Input","Search","Form"].includes(k)) return str(provided["field-"+(index+1)])||label(node.label)||"Input";
  if(["Image","Video","Logo","Icon","Avatar"].includes(k)){
    const refs=answers?.assetStrategy==="project" ? arr(intake?.content?.assetRefs).map(x=>x.path) : str(answers?.assetMap).split(/[,\n]/).map(x=>x.trim()).filter(Boolean);
    return refs[index%Math.max(1,refs.length)]||label(node.label)||k;
  }
  return label(node.label)||k;
}
function makeLayer(node,parent,e,answers,intake,index){
  const tablet=find(vp(e,"tablet"),node.selector),mobile=find(vp(e,"mobile"),node.selector);
  const pt=find(vp(e,"tablet"),parent.selector)||parent,pm=find(vp(e,"mobile"),parent.selector)||parent;
  return {
    id:"layer-"+(index+1),selector:node.selector,kind:kind(node),tag:node.tag||"div",
    label:label(node.label)||kind(node),content:contentFor(node,answers,intake,index),
    attrs:node.attrs||{},style:node.style||{},desktop:relativeRect(node,parent),
    tablet:tablet?relativeRect(tablet,pt):null,mobile:mobile?relativeRect(mobile,pm):null
  };
}
function buildModel(e,intake,answers){
  const d=vp(e,"desktop"),all=nodes(d),roots=selectedRoots(e),regions=[],used=new Set();
  roots.forEach((root,ri)=>{
    const rr=root.rect||{},layers=[];
    for(const node of all){
      if(!node?.selector||node.selector===root.selector||used.has(node.selector)||!usable(node))continue;
      const r=node.rect||{},cx=(num(r.x)||0)+(num(r.width)||0)/2,cy=(num(r.y)||0)+(num(r.height)||0)/2;
      const inside=cx>=(num(rr.x)||0)&&cx<=((num(rr.x)||0)+(num(rr.width)||0))&&cy>=(num(rr.y)||0)&&cy<=((num(rr.y)||0)+(num(rr.height)||0));
      if(!inside)continue;
      used.add(node.selector);
      layers.push(makeLayer(node,root,e,answers,intake,used.size-1));
      if(layers.length>=72)break;
    }
    layers.sort((a,b)=>(a.desktop.top-b.desktop.top)||(a.desktop.left-b.desktop.left));
    regions.push({
      id:"region-"+(ri+1),selector:root.selector,kind:kind(root),label:label(root.label)||kind(root),
      style:root.style||{},rect:root.rect||{},
      tabletRect:find(vp(e,"tablet"),root.selector)?.rect||null,
      mobileRect:find(vp(e,"mobile"),root.selector)?.rect||null,
      layers
    });
  });
  const layers=regions.flatMap(r=>r.layers),total=Math.max(1,layers.length);
  return {
    schema:"kk-project-aware-layout/v1",
    title:str(intake.projectName||e.capture?.title,"Generated Design"),
    referenceUrl:e.capture?.finalUrl||e.capture?.referenceUrl||null,
    framework:intake.effectiveFramework,packageManager:intake.packageManager,projectMode:intake.projectMode,
    projectProfile:intake.projectProfile,readinessPercent:intake.readinessPercent,regions,
    viewports:{
      desktop:d.viewport||d.targetViewport||{width:1440,height:900},
      tablet:vp(e,"tablet").viewport||vp(e,"tablet").targetViewport||{width:820,height:1180},
      mobile:vp(e,"mobile").viewport||vp(e,"mobile").targetViewport||{width:390,height:844}
    },
    coverage:{
      desktopLayers:layers.length,
      tabletMatched:layers.filter(l=>l.tablet).length,
      mobileMatched:layers.filter(l=>l.mobile).length,
      responsiveMatchPercent:Math.round(((layers.filter(l=>l.tablet).length+layers.filter(l=>l.mobile).length)/(total*2))*100)
    },
    evidenceConfidence:e.confidence??null
  };
}
function styleDecl(s={}){
  const out=[],add=(k,v)=>{if(v&&v!=="normal"&&v!=="none"&&v!=="auto")out.push(k+":"+css(v));};
  add("color",s.color);
  if(s.backgroundColor&&!/rgba?\(0,\s*0,\s*0,\s*0\)/.test(s.backgroundColor))add("background-color",s.backgroundColor);
  add("font-family",s.fontFamily);add("font-size",s.fontSize);add("font-weight",s.fontWeight);add("font-style",s.fontStyle);
  add("line-height",s.lineHeight);add("letter-spacing",s.letterSpacing);add("text-align",s.textAlign);add("text-transform",s.textTransform);
  add("border",s.border);add("border-radius",s.borderRadius);add("box-shadow",s.boxShadow);add("opacity",s.opacity);
  return out.join(";");
}
function layerMarkup(layer){
  const k=layer.kind,c=esc(layer.content),id=layer.id;
  if(k==="Button")return '<button class="kkx-layer kkx-button" data-layer="'+id+'">'+c+'</button>';
  if(["Input","Search","Form"].includes(k))return '<div class="kkx-layer kkx-field" data-layer="'+id+'"><span>'+c+'</span></div>';
  if(["Image","Video","Logo","Icon","Avatar"].includes(k)){
    const usableSrc=/^(https?:\/\/|\/|\.\.\/|\.\/)/.test(layer.content);
    if(usableSrc && ["Image","Logo","Avatar"].includes(k)) return '<img class="kkx-layer kkx-media kkx-img" data-layer="'+id+'" alt="'+esc(layer.label)+'" src="'+esc(layer.content)+'"/>';
    return '<div class="kkx-layer kkx-media" data-layer="'+id+'" data-media="'+esc(k)+'"><span>'+c+'</span></div>';
  }
  if(k==="Navigation")return '<nav class="kkx-layer kkx-text" data-layer="'+id+'">'+c+'</nav>';
  const tag=/^h[1-6]$|^p$|^span$|^label$|^a$/i.test(layer.tag)?layer.tag:"div";
  return '<'+tag+' class="kkx-layer kkx-text" data-layer="'+id+'">'+c+'</'+tag+'>';
}
function geometryCss(model){
  const rules=[];
  for(const region of model.regions){
    const dh=Math.max(80,Math.round(num(region.rect?.height)||520));
    const th=Math.max(80,Math.round(num(region.tabletRect?.height)||dh));
    const mh=Math.max(80,Math.round(num(region.mobileRect?.height)||th));
    rules.push('[data-region="'+region.id+'"]{position:relative;min-height:'+dh+'px;'+styleDecl(region.style)+'}');
    rules.push('@media(max-width:900px){[data-region="'+region.id+'"]{min-height:'+th+'px}}');
    rules.push('@media(max-width:520px){[data-region="'+region.id+'"]{min-height:'+mh+'px}}');
    for(const layer of region.layers){
      const d=layer.desktop;
      rules.push('[data-layer="'+layer.id+'"]{position:absolute;left:'+d.left.toFixed(4)+'%;top:'+d.top.toFixed(4)+'%;width:'+Math.max(.2,d.width).toFixed(4)+'%;height:'+Math.max(.2,d.height).toFixed(4)+'%;'+styleDecl(layer.style)+'}');
      if(layer.tablet){
        const t=layer.tablet;
        rules.push('@media(max-width:900px){[data-layer="'+layer.id+'"]{left:'+t.left.toFixed(4)+'%;top:'+t.top.toFixed(4)+'%;width:'+Math.max(.2,t.width).toFixed(4)+'%;height:'+Math.max(.2,t.height).toFixed(4)+'%}}');
      }
      if(layer.mobile){
        const m=layer.mobile;
        rules.push('@media(max-width:520px){[data-layer="'+layer.id+'"]{left:'+m.left.toFixed(4)+'%;top:'+m.top.toFixed(4)+'%;width:'+Math.max(.2,m.width).toFixed(4)+'%;height:'+Math.max(.2,m.height).toFixed(4)+'%}}');
      }
    }
  }
  return rules.join("\n");
}
function render(model){
  const first=model.regions[0]?.style||{},bg=first.backgroundColor||"#101012",color=first.color||"#f7f4ef";
  const base='*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:'+css(bg)+';color:'+css(color)+'}body{overflow-x:hidden}.kkx-page{width:min(100%,1440px);margin:0 auto}.kkx-region{overflow:hidden}.kkx-layer{margin:0;box-sizing:border-box}.kkx-text{display:flex;align-items:center;overflow:hidden;white-space:pre-wrap}.kkx-button{display:flex;align-items:center;justify-content:center;padding:0 12px;cursor:pointer}.kkx-field{display:flex;align-items:center;padding:0 12px;border:1px solid rgba(127,127,127,.3)}.kkx-media{display:grid;place-items:center;overflow:hidden;background:linear-gradient(145deg,rgba(127,127,127,.18),rgba(127,127,127,.06));border:1px solid rgba(127,127,127,.16)}.kkx-media span{font:500 11px/1.2 system-ui;color:rgba(127,127,127,.9);text-align:center;padding:8px}.kkx-img{object-fit:cover}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}';
  const body=model.regions.map(r=>'<section class="kkx-region" data-region="'+r.id+'">'+r.layers.map(layerMarkup).join("")+'</section>').join("\n");
  const cssText=base+"\n"+geometryCss(model);
  const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(model.title)+'</title><style>'+cssText+'</style></head><body><main class="kkx-page">'+body+'</main></body></html>';
  return {body,cssText,html};
}
function frameworkKey(v){const x=str(v).toLowerCase();return x.includes("next")?"next":x.includes("react")?"react":"html";}
function sourceFiles(model,r){
  const fw=frameworkKey(model.framework),jsx=r.body.replaceAll("class=","className=");
  const routeRoot=str(model.projectProfile?.routeRoot);
  const isNew=model.projectMode==="new";
  if(fw==="next"){
    if(isNew){
      return [
        {path:"package.json",content:JSON.stringify({name:slug(model.title),private:true,scripts:{dev:"next dev",build:"next build",start:"next start"},dependencies:{next:">=14",react:">=18","react-dom":">=18"}},null,2)},
        {path:"app/layout.jsx",content:'import "./globals.css";export const metadata={title:"'+esc(model.title)+'"};export default function RootLayout({children}){return <html lang="en"><body>{children}</body></html>}'},
        {path:"app/page.jsx",content:'export default function Page(){return <main className="kkx-page">'+jsx+'</main>}'},
        {path:"app/globals.css",content:r.cssText}
      ];
    }
    const root=routeRoot&&/app$/.test(routeRoot)?routeRoot:"app";
    return [
      {path:root+"/kk-generated/page.jsx",content:'import "./page.css";export default function GeneratedDesignPage(){return <main className="kkx-page">'+jsx+'</main>}'},
      {path:root+"/kk-generated/page.css",content:r.cssText}
    ];
  }
  if(fw==="react"){
    if(isNew){
      return [
        {path:"package.json",content:JSON.stringify({name:slug(model.title),private:true,scripts:{dev:"vite",build:"vite build",preview:"vite preview"},dependencies:{react:">=18","react-dom":">=18"},devDependencies:{vite:">=5","@vitejs/plugin-react":">=4"}},null,2)},
        {path:"index.html",content:'<div id="root"></div><script type="module" src="/src/main.jsx"></script>'},
        {path:"src/main.jsx",content:'import React from "react";import{createRoot}from"react-dom/client";import App from "./App.jsx";import "./styles.css";createRoot(document.getElementById("root")).render(<App/>);'},
        {path:"src/App.jsx",content:'export default function App(){return <main className="kkx-page">'+jsx+'</main>}'},
        {path:"src/styles.css",content:r.cssText}
      ];
    }
    const root=str(model.projectProfile?.sourceRoot,"src");
    return [
      {path:root+"/kk-generated/ExactDesignPage.jsx",content:'import "./ExactDesignPage.css";export default function ExactDesignPage(){return <main className="kkx-page">'+jsx+'</main>}'},
      {path:root+"/kk-generated/ExactDesignPage.css",content:r.cssText}
    ];
  }
  if(isNew){
    return [
      {path:"package.json",content:JSON.stringify({name:slug(model.title),private:true,scripts:{dev:"vite",build:"vite build",preview:"vite preview"},devDependencies:{vite:">=5"}},null,2)},
      {path:"index.html",content:r.html}
    ];
  }
  return [{path:"kk-generated/index.html",content:r.html}];
}
function commands(pm){return pm==="pnpm"?{i:"pnpm install",r:"pnpm dev"}:pm==="yarn"?{i:"yarn install",r:"yarn dev"}:pm==="bun"?{i:"bun install",r:"bun run dev"}:{i:"npm install",r:"npm run dev"};}
function supportFiles(a,generated){
  const pm=a.packageManager==="unknown"?"npm":a.packageManager,c=commands(pm);
  const req="# PC Requirements\n\n## Project fit\n- Framework: "+a.effectiveFramework+"\n- Language: "+a.language+"\n- Package manager: "+pm+"\n- Target platforms: "+a.targetPlatforms.join(", ")+"\n- Project mode: "+a.projectMode+"\n- Target page: "+(a.targetPage||"not specified")+"\n\n## Windows\n- Windows 10/11 64-bit\n- Node.js 20+; Node 22 LTS recommended\n- PowerShell 7 recommended\n- Git optional\n\n## macOS\n- macOS 13+ recommended\n- Node.js 20+; Node 22 LTS recommended\n- Terminal / zsh\n- Git optional\n\nNo global framework CLI is required.\n";
  const list=generated.map(f=>"- "+f.path).join("\n");
  const integ="# Project Integration\n\nThe generated source is isolated so it can fit the analyzed project without blindly overwriting current code.\n\n- Framework: "+a.effectiveFramework+"\n- Package manager: "+a.packageManager+"\n- Styling: "+(a.styling.join(", ")||"not detected")+"\n- Source root: "+(a.structure.sourceRoot||"not detected")+"\n- Component root: "+(a.structure.componentRoot||"not detected")+"\n- Route root: "+(a.structure.routeRoot||"not detected")+"\n- Requested target: "+(a.targetPage||"not specified")+"\n\n## Generated source\n"+list+"\n\nCompare imports, handlers, data flow, assets and route conventions before replacing an existing production file.\n";
  return [
    {path:"SYSTEM-REQUIREMENTS.md",content:req},
    {path:"PROJECT-INTEGRATION.md",content:integ},
    {path:"SETUP-WINDOWS.ps1",content:'$ErrorActionPreference="Stop"\nif(-not(Get-Command node -ErrorAction SilentlyContinue)){throw "Node.js 20+ is required."}\n$major=[int]((node -v).TrimStart("v").Split(".")[0]);if($major -lt 20){throw "Node.js 20+ is required."}\n'+c.i+'\nWrite-Host "Setup complete." -ForegroundColor Green\n'},
    {path:"RUN-WINDOWS.ps1",content:'$ErrorActionPreference="Stop"\n'+c.r+'\n'},
    {path:"setup-macos.sh",content:'#!/bin/zsh\nset -e\ncommand -v node >/dev/null || { echo "Node.js 20+ is required."; exit 1; }\n'+c.i+'\necho "Setup complete."\n'},
    {path:"run-macos.sh",content:'#!/bin/zsh\nset -e\n'+c.r+'\n'},
    {path:"SETUP-AND-RUN-WINDOWS.ps1",content:'$ErrorActionPreference="Stop"\nif(-not(Get-Command node -ErrorAction SilentlyContinue)){throw "Node.js 20+ is required."}\n'+c.i+'\n'+c.r+'\n'},
    {path:"setup-and-run-macos.sh",content:'#!/bin/zsh\nset -e\ncommand -v node >/dev/null || { echo "Node.js 20+ is required."; exit 1; }\n'+c.i+'\n'+c.r+'\n'}
  ];
}
function crc32(buf){let crc=0xffffffff;for(const b of buf){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function zipStore(files){
  const locals=[],centrals=[];let offset=0;
  for(const file of files){
    const name=Buffer.from(file.path.replaceAll("\\","/")),data=Buffer.from(file.content,"utf8"),crc=crc32(data);
    const local=Buffer.alloc(30+name.length);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);name.copy(local,30);locals.push(local,data);
    const central=Buffer.alloc(46+name.length);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);name.copy(central,46);centrals.push(central);offset+=local.length+data.length;
  }
  const cs=centrals.reduce((n,b)=>n+b.length,0),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cs,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,...centrals,end]);
}

export function compileProjectAwareDesign({evidence:inputEvidence,markdown="",files=[],answers={},options={}}={}){
  const evidence=parseEvidence(inputEvidence),normalized=normalizeProjectFiles(files);
  const intake=analyzeProjectIntake({evidence,files:normalized,answers});
  if(!intake.exactReady&&!options.allowPrototype){
    const error=new Error("Project information is not ready for an exact build. Resolve required Project Fit items and replace placeholder-only content/assets.");
    error.code="PROJECT_INTAKE_INCOMPLETE";error.intake=intake;throw error;
  }
  const model=buildModel(evidence,intake,answers),rendered=render(model),generated=sourceFiles(model,rendered);
  const out=[...generated,
    {path:"REFERENCE-DESIGN.md",content:String(markdown||"# DESIGN.md\n")},
    {path:"PROJECT-FIT.json",content:JSON.stringify(intake,null,2)},
    {path:"DESIGN-BUILD.json",content:JSON.stringify(model,null,2)},
    ...supportFiles(intake,generated)
  ];
  const zip=zipStore(out);
  return {
    schema:"kk-project-aware-design-build/v1",
    filename:slug(intake.projectName||model.title)+"-project-fit.zip",
    previewHtml:rendered.html,files:out,zipBase64:zip.toString("base64"),model,intake,
    summary:{
      projectReadiness:intake.readinessPercent,framework:intake.effectiveFramework,packageManager:intake.packageManager,
      regions:model.regions.length,measuredLayers:model.coverage.desktopLayers,responsiveMatchPercent:model.coverage.responsiveMatchPercent,
      evidenceConfidence:model.evidenceConfidence,projectFiles:out.length,zipBytes:zip.length
    }
  };
}
