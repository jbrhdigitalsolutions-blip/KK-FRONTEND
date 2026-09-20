import { candidateFamily, classifyCandidate } from "../reference-design/design-md.mjs";
import { analyzeProjectContext, integrationSupportFiles, newProjectSupportFiles } from "./project-fit.mjs";

const ALLOWED_OUTPUTS = new Set(["html","react","next"]);
const ALLOWED_CONTENT = new Set(["placeholders","reference-labels"]);
const ALLOWED_FIDELITY = new Set(["accurate","balanced","inspired"]);

function arr(value){ return Array.isArray(value) ? value : []; }
function text(value, fallback=""){ const v=String(value ?? "").trim(); return v || fallback; }
function num(value){ const n=Number(value); return Number.isFinite(n) ? n : null; }
function clamp(n,min,max){ return Math.min(max,Math.max(min,n)); }
function esc(value){
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}
function cssEsc(value){ return String(value ?? "").replace(/[{};]/g,"").trim(); }
function slug(value){
  return String(value || "project").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48) || "design-build";
}
function px(value){
  const m=String(value ?? "").match(/^(-?[\d.]+)px$/);
  return m ? Number(m[1]) : null;
}
function isTransparent(value){
  return !value || value==="transparent" || /rgba?\(0,\s*0,\s*0,\s*0\)/i.test(value);
}
function styleFreq(nodes,key,predicate=()=>true){
  const counts=new Map();
  for(const node of nodes){
    const value=node?.style?.[key];
    if(value && predicate(value)) counts.set(value,(counts.get(value)||0)+1);
  }
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]).map(([value,count])=>({value,count}));
}
function firstUseful(freq,fallback){ return freq[0]?.value || fallback; }
function parseEvidence(input){
  const evidence=typeof input==="string" ? JSON.parse(input) : input;
  if(!evidence || evidence.schema!=="kk-reference-design-evidence-compact/v2"){
    throw new Error("Build Page requires DESIGN-EVIDENCE.json schema kk-reference-design-evidence-compact/v2.");
  }
  if(!arr(evidence.viewports).length) throw new Error("Design evidence contains no verified viewports.");
  return evidence;
}
function viewport(evidence,name){ return arr(evidence.viewports).find(v=>v.name===name) || {}; }
function nodesFor(vp){ return [...arr(vp.scopes),...arr(vp.representativeElements)]; }

function deriveTokens(evidence){
  const desktop=viewport(evidence,"desktop");
  const nodes=nodesFor(desktop);
  const body=nodes.find(n=>n.tag==="body") || desktop.scopes?.[0] || {};
  const colors=styleFreq(nodes,"color",v=>!isTransparent(v));
  const backgrounds=styleFreq(nodes,"backgroundColor",v=>!isTransparent(v));
  const radii=styleFreq(nodes,"borderRadius",v=>px(v)!=null && px(v)>=0 && px(v)<100);
  const gaps=styleFreq(nodes,"gap",v=>px(v)!=null && px(v)>=0 && px(v)<160);
  const fonts=styleFreq(nodes,"fontFamily");
  const fontSizes=styleFreq(nodes,"fontSize",v=>px(v)!=null && px(v)>=8 && px(v)<=120);
  const accentCandidate=colors.find(x=>x.value!==body.style?.color && !/rgb\(255, 255, 255\)|rgb\(247, 244, 239\)/.test(x.value));
  return {
    background: body.style?.backgroundColor || firstUseful(backgrounds,"#101012"),
    surface: backgrounds.find(x=>x.value!==(body.style?.backgroundColor||""))?.value || "rgba(255,255,255,.06)",
    text: body.style?.color || firstUseful(colors,"#f7f4ef"),
    muted: colors.find(x=>x.value!==(body.style?.color||""))?.value || "rgba(255,255,255,.68)",
    accent: accentCandidate?.value || "#7f99f5",
    font: body.style?.fontFamily || firstUseful(fonts,"system-ui, sans-serif"),
    baseSize: body.style?.fontSize || firstUseful(fontSizes,"16px"),
    radius: firstUseful(radii,"12px"),
    gap: firstUseful(gaps,"16px"),
  };
}
function cleanLabel(value){
  const v=text(value);
  if(!v || /^(div|span|section|button|img|svg|a|p|h\d)$/i.test(v)) return "";
  return v.replace(/\s+/g," ").slice(0,100);
}
function semanticKind(node){
  return classifyCandidate({
    tag:node?.tag, role:node?.role, className:node?.className,
    label:node?.label, interactive:node?.interactive,
    animation:node?.style?.animationName && node.style.animationName!=="none"
  });
}
function buildRegions(evidence,contentMode){
  const desktop=viewport(evidence,"desktop");
  const tablet=viewport(evidence,"tablet");
  const mobile=viewport(evidence,"mobile");
  const all=nodesFor(desktop);
  const selected=arr(evidence.capture?.selection);
  const selectedSelectors=new Set(selected.map(x=>x.selector).filter(Boolean));
  const structuralKinds=new Set(["Header","Navigation","Sidebar","Workspace","Hero","Section","Card","Grid","List","Footer","Overlay"]);
  const candidates=[];
  const seen=new Set();

  for(const node of all){
    if(!node?.selector || seen.has(node.selector)) continue;
    const kind=semanticKind(node);
    const r=node.rect||{};
    const important=selectedSelectors.has(node.selector) || structuralKinds.has(kind) ||
      (num(r.width)>=240 && num(r.height)>=100 && ["body","main","section","header","footer","nav","aside"].includes(node.tag));
    if(!important) continue;
    seen.add(node.selector);
    const bySelector=vp=>nodesFor(vp).find(x=>x.selector===node.selector);
    const t=bySelector(tablet), m=bySelector(mobile);
    candidates.push({
      id:"region-"+(candidates.length+1),
      selector:node.selector,
      kind,
      family:candidateFamily(kind),
      label: cleanLabel(selected.find(x=>x.selector===node.selector)?.label) ||
        cleanLabel(node.label) ||
        (kind==="Component" ? "Content block" : kind),
      rect:node.rect||null,
      tabletRect:t?.rect||null,
      mobileRect:m?.rect||null,
      style:node.style||{},
      interactive:Boolean(node.interactive),
    });
  }

  candidates.sort((a,b)=>(a.rect?.y||0)-(b.rect?.y||0)||(a.rect?.x||0)-(b.rect?.x||0));
  const pruned=[];
  for(const region of candidates){
    const duplicate=pruned.some(x=>
      x.kind===region.kind &&
      Math.abs((x.rect?.y||0)-(region.rect?.y||0))<8 &&
      Math.abs((x.rect?.height||0)-(region.rect?.height||0))<8
    );
    if(!duplicate) pruned.push(region);
    if(pruned.length>=24) break;
  }
  if(!pruned.length){
    pruned.push({id:"region-1",selector:"body",kind:"Hero",family:"Structure",label:"Primary content",rect:{width:1440,height:560},style:{}});
  }

  const containedChildren = region => {
    const p=region.rect||{};
    if(!num(p.width)||!num(p.height)) return [];
    const out=[];
    const childSeen=new Set();
    for(const node of all){
      if(!node?.selector || node.selector===region.selector || childSeen.has(node.selector)) continue;
      const r=node.rect||{};
      if(!num(r.width)||!num(r.height)) continue;
      const cx=(r.x||0)+(r.width||0)/2, cy=(r.y||0)+(r.height||0)/2;
      const inside=cx>=(p.x||0) && cx<=((p.x||0)+(p.width||0)) && cy>=(p.y||0) && cy<=((p.y||0)+(p.height||0));
      if(!inside) continue;
      const kind=semanticKind(node);
      if(["Component","Interactive"].includes(kind)) continue;
      childSeen.add(node.selector);
      out.push({
        selector:node.selector,
        kind,
        family:candidateFamily(kind),
        label:cleanLabel(node.label)||kind,
        rect:node.rect||null,
        style:node.style||{},
      });
      if(out.length>=12) break;
    }
    return out;
  };

  return pruned.map((region,index)=>({
    ...region,
    displayLabel: contentMode==="reference-labels" ? region.label : placeholderFor(region.kind,index),
    children:containedChildren(region).map((child,childIndex)=>({
      ...child,
      displayLabel:contentMode==="reference-labels" ? child.label : placeholderFor(child.kind,childIndex),
    })),
  }));
}
function placeholderFor(kind,index){
  const map={
    Header:"Site header",Navigation:"Primary navigation",Hero:"Hero headline",Section:"Content section",
    Card:"Feature card",Grid:"Content grid",List:"Content list",Footer:"Site footer",
    Button:"Action",Form:"Form",Input:"Input",Search:"Search",Typography:"Heading",
    Image:"Image",Video:"Video",Carousel:"Carousel",Gallery:"Gallery",Workspace:"Main content",
    Sidebar:"Sidebar",Overlay:"Overlay"
  };
  return map[kind] || `Content block ${index+1}`;
}
function regionHeight(region){
  const h=num(region.rect?.height);
  if(!h) return null;
  return Math.round(clamp(h,80,760));
}
function mobileHeight(region){
  const h=num(region.mobileRect?.height);
  return h ? Math.round(clamp(h,72,820)) : null;
}
function layoutModel(evidence,options){
  const tokens=deriveTokens(evidence);
  const regions=buildRegions(evidence,options.contentMode);
  const project=options.projectProfile || null;
  const desktop=viewport(evidence,"desktop");
  const tablet=viewport(evidence,"tablet");
  const mobile=viewport(evidence,"mobile");
  const unknownCount=(options.markdown?.match(/UNKNOWN\s+[—-]\s+DO NOT INVENT/g)||[]).length;
  return {
    schema:"kk-no-code-layout/v1",
    title:text(evidence.capture?.title,"Generated Design"),
    referenceUrl:text(evidence.capture?.finalUrl || evidence.capture?.referenceUrl),
    tokens,
    regions,
    viewports:{
      desktop:desktop.viewport||desktop.targetViewport||{width:1440,height:900},
      tablet:tablet.viewport||tablet.targetViewport||{width:820,height:1180},
      mobile:mobile.viewport||mobile.targetViewport||{width:390,height:844},
    },
    responsiveCss:{
      mediaQueries:arr(evidence.responsiveCss?.mediaQueries),
      containerQueries:arr(evidence.responsiveCss?.containerQueries),
    },
    project,
    evidence:{
      confidence:num(evidence.confidence),
      interactionCount:arr(evidence.interactions).length,
      animationCount:arr(evidence.animations).length,
      unknownCount,
    }
  };
}

function childMarkup(children=[]){
  const textNode=children.find(x=>x.kind==="Typography");
  const buttons=children.filter(x=>x.kind==="Button").slice(0,2);
  const hasInput=children.some(x=>["Input","Search","Form"].includes(x.kind));
  const media=children.filter(x=>["Image","Video","Gallery","Carousel"].includes(x.kind)).slice(0,3);
  return {
    heading:textNode ? esc(textNode.displayLabel) : null,
    actions:buttons.map((x,i)=>`<button class="${i?"secondary":""}" type="button">${esc(x.displayLabel)}</button>`).join(""),
    input:hasInput ? '<div class="kk-input"><span>Input</span><button type="button">Submit</button></div>' : "",
    media:media.length ? `<div class="kk-media-grid">${media.map(x=>`<div class="kk-media-tile"><span>${esc(x.displayLabel)}</span></div>`).join("")}</div>` : "",
  };
}
function regionMarkup(region,index,model){
  const id=`section-${index+1}`;
  const label=esc(region.displayLabel);
  const kind=region.kind;
  const child=childMarkup(region.children);
  const hasProject=Boolean(model?.project);
  const project=model?.project || {};
  const content=project.content || {};
  const brand=esc(content.brand || project.projectName || "Brand");
  const nav=arr(content.navItems).length ? arr(content.navItems).slice(0,6) : ["Explore","Features"];
  const primary=esc(content.primaryCta || "Get started");
  const secondary=esc(content.secondaryCta || "Learn more");
  const heroTitle=esc(content.heroTitle || child.heading || label);
  const heroBody=esc(content.heroBody || "Layout, typography and responsive anchors are compiled from verified reference evidence.");
  const logoAsset=project.assetMap?.logoAsset || "";
  const heroAsset=project.assetMap?.heroAsset || "";
  if(kind==="Header" || kind==="Navigation"){
    const logo=logoAsset ? `<img class="kk-logo-image" src="${esc(logoAsset)}" alt="${brand}"/>` : brand;
    return `<header id="${id}" class="kk-region kk-header" data-kind="${esc(kind)}"><a class="kk-logo" href="#">${logo}</a><nav>${nav.map((item,i)=>`<a href="#section-${i+1}">${esc(item)}</a>`).join("")}<button type="button">${primary}</button></nav></header>`;
  }
  if(kind==="Footer"){
    return `<footer id="${id}" class="kk-region kk-footer" data-kind="Footer"><strong>${brand}</strong><span>${esc(content.footerText || region.displayLabel || "")}</span></footer>`;
  }
  if(kind==="Hero"){
    const media=heroAsset ? `<div class="kk-media"><img src="${esc(heroAsset)}" alt=""/></div>` : (child.media || '<div class="kk-media"><span>Media</span></div>');
    return `<section id="${id}" class="kk-region kk-hero" data-kind="Hero"><div class="kk-copy"><span class="kk-eyebrow">${hasProject?brand:"VERIFIED DESIGN"}</span><h1>${heroTitle}</h1><p>${heroBody}</p><div class="kk-actions"><button type="button">${primary}</button>${content.secondaryCta ? `<button class="secondary" type="button">${secondary}</button>` : ""}</div>${child.input}</div>${media}</section>`;
  }
  if(kind==="Card" || kind==="Grid" || kind==="List"){
    return `<section id="${id}" class="kk-region kk-section" data-kind="${esc(kind)}"><div class="kk-section-head"><span>SECTION ${index+1}</span><h2>${child.heading||label}</h2></div>${child.media}<div class="kk-grid"><article><b>01</b><h3>Component</h3><p>Evidence-led content placeholder.</p></article><article><b>02</b><h3>Responsive</h3><p>Adapts across verified viewport anchors.</p></article><article><b>03</b><h3>Reusable</h3><p>Generated without a coding agent.</p></article></div>${child.input}<div class="kk-actions">${child.actions}</div></section>`;
  }
  if(kind==="Sidebar"){
    return `<aside id="${id}" class="kk-region kk-sidebar" data-kind="Sidebar"><strong>${label}</strong><a href="#">Overview</a><a href="#">Library</a><a href="#">Settings</a></aside>`;
  }
  if(kind==="Button"){
    return `<section id="${id}" class="kk-region kk-section kk-control-region" data-kind="Button"><button type="button">${label}</button></section>`;
  }
  if(kind==="Input" || kind==="Search" || kind==="Form"){
    return `<section id="${id}" class="kk-region kk-section kk-control-region" data-kind="${esc(kind)}"><div class="kk-input"><span>${label}</span><button type="button">Submit</button></div></section>`;
  }
  if(["Image","Video","Gallery","Carousel"].includes(kind)){
    return `<section id="${id}" class="kk-region kk-section" data-kind="${esc(kind)}"><div class="kk-media-grid"><div class="kk-media-tile"><span>${label}</span></div></div></section>`;
  }
  return `<section id="${id}" class="kk-region kk-section" data-kind="${esc(kind)}"><div class="kk-section-head"><span>${esc(kind.toUpperCase())}</span><h2>${child.heading||label}</h2></div><p class="kk-lede">This region was generated from measured reference geometry and design tokens. Replace the placeholder content without changing the compiled visual system.</p>${child.media}${child.input}<div class="kk-actions">${child.actions}</div></section>`;
}
function generatedCss(model,options){
  const t=model.tokens;
  const regionRules=model.regions.map((r,i)=>{
    const h=regionHeight(r);
    const mh=mobileHeight(r);
    const measuredWidth=num(r.rect?.width);
    const bg=!isTransparent(r.style?.backgroundColor) ? cssEsc(r.style.backgroundColor) : null;
    const color=r.style?.color ? cssEsc(r.style.color) : null;
    const radius=px(r.style?.borderRadius);
    const padding=["paddingTop","paddingRight","paddingBottom","paddingLeft"].map(k=>px(r.style?.[k]));
    const hasPadding=padding.some(v=>v!=null && v>0);
    const desktop=[
      h?`min-height:${h}px`:"",
      measuredWidth && measuredWidth<1380?`max-width:${Math.round(measuredWidth)}px`:"",
      bg?`background:${bg}`:"",
      color?`color:${color}`:"",
      radius!=null && radius>0 && radius<100?`border-radius:${radius}px`:"",
      hasPadding?`padding:${padding.map(v=>(v??0)+"px").join(" ")}`:"",
    ].filter(Boolean).join(";");
    const mobile=[mh?`min-height:${mh}px`:"","max-width:100%"].filter(Boolean).join(";");
    return `#section-${i+1}{${desktop}} @media(max-width:820px){#section-${i+1}{${mobile}}}`;
  }).join("\n");
  const fidelity=options.fidelity;
  const density=fidelity==="inspired" ? ".88" : fidelity==="balanced" ? ".94" : "1";
  return `:root{
  --kk-bg:${cssEsc(t.background)};
  --kk-surface:${cssEsc(t.surface)};
  --kk-text:${cssEsc(t.text)};
  --kk-muted:${cssEsc(t.muted)};
  --kk-accent:${cssEsc(t.accent)};
  --kk-font:${cssEsc(t.font)};
  --kk-base:${cssEsc(t.baseSize)};
  --kk-radius:${cssEsc(t.radius)};
  --kk-gap:${cssEsc(t.gap)};
  --kk-density:${density};
}
*{box-sizing:border-box}
html{background:var(--kk-bg);color:var(--kk-text);scroll-behavior:smooth}
body{margin:0;background:var(--kk-bg);color:var(--kk-text);font:400 var(--kk-base)/1.5 var(--kk-font);overflow-x:hidden}
button,a,input,textarea{font:inherit}
button{border:0;border-radius:var(--kk-radius);padding:11px 18px;background:var(--kk-text);color:var(--kk-bg);font-weight:700;cursor:pointer}
button.secondary{background:transparent;color:var(--kk-text);border:1px solid color-mix(in srgb,var(--kk-text) 20%,transparent)}
a{color:inherit;text-decoration:none}
.kk-region{width:min(100%,1440px);margin:0 auto}
.kk-header{min-height:72px;padding:14px clamp(18px,4vw,64px);display:flex;align-items:center;justify-content:space-between;gap:24px;position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--kk-bg) 82%,transparent);backdrop-filter:blur(18px);border-bottom:1px solid color-mix(in srgb,var(--kk-text) 10%,transparent)}
.kk-logo{font-size:18px;font-weight:800;display:flex;align-items:center}.kk-logo-image{display:block;max-width:140px;max-height:36px;object-fit:contain}.kk-header nav{display:flex;align-items:center;gap:22px;font-size:14px}
.kk-hero{padding:clamp(64px,8vw,128px) clamp(18px,5vw,80px);display:grid;grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr);align-items:center;gap:clamp(28px,6vw,92px)}
.kk-copy{max-width:760px}.kk-eyebrow,.kk-section-head span{display:block;font-size:11px;letter-spacing:.14em;font-weight:800;color:var(--kk-accent);margin-bottom:12px}
h1{font-size:clamp(48px,7vw,92px);line-height:.98;letter-spacing:-.045em;margin:0 0 22px;font-weight:500}
h2{font-size:clamp(34px,5vw,64px);line-height:1.02;letter-spacing:-.035em;margin:0;font-weight:500}
h3{margin:10px 0 4px;font-size:20px}.kk-copy p,.kk-lede{max-width:680px;color:var(--kk-muted);font-size:clamp(16px,1.5vw,20px)}
.kk-actions{display:flex;gap:10px;margin-top:28px}.kk-media{aspect-ratio:4/5;border-radius:calc(var(--kk-radius)*1.5);display:grid;place-items:center;overflow:hidden;background:linear-gradient(145deg,color-mix(in srgb,var(--kk-accent) 30%,var(--kk-surface)),var(--kk-surface));border:1px solid color-mix(in srgb,var(--kk-text) 12%,transparent);color:var(--kk-muted)}.kk-media>img{width:100%;height:100%;object-fit:cover;display:block}
.kk-media-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--kk-gap);margin-top:28px}.kk-media-tile{min-height:180px;display:grid;place-items:center;border-radius:var(--kk-radius);background:linear-gradient(145deg,color-mix(in srgb,var(--kk-accent) 18%,var(--kk-surface)),var(--kk-surface));border:1px solid color-mix(in srgb,var(--kk-text) 10%,transparent);color:var(--kk-muted)}.kk-input{max-width:720px;margin-top:22px;padding:8px 8px 8px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid color-mix(in srgb,var(--kk-text) 14%,transparent);border-radius:var(--kk-radius);background:var(--kk-surface);color:var(--kk-muted)}.kk-control-region{display:flex;align-items:center;justify-content:center}
.kk-section{padding:clamp(56px,8vw,120px) clamp(18px,5vw,80px);border-top:1px solid color-mix(in srgb,var(--kk-text) 8%,transparent)}
.kk-section-head{max-width:900px}.kk-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--kk-gap);margin-top:42px}
.kk-grid article{min-height:180px;padding:calc(24px*var(--kk-density));border-radius:var(--kk-radius);background:var(--kk-surface);border:1px solid color-mix(in srgb,var(--kk-text) 9%,transparent)}
.kk-grid article b{color:var(--kk-accent);font-size:12px}.kk-grid article p{color:var(--kk-muted);margin:0}
.kk-sidebar{padding:24px;display:grid;gap:14px;max-width:320px;background:var(--kk-surface)}
.kk-footer{padding:36px clamp(18px,5vw,80px);display:flex;align-items:center;justify-content:space-between;gap:24px;border-top:1px solid color-mix(in srgb,var(--kk-text) 10%,transparent);color:var(--kk-muted)}
.kk-footer strong{color:var(--kk-text)}
@media(max-width:820px){
  .kk-header nav a{display:none}.kk-hero{grid-template-columns:1fr;padding-top:72px}.kk-media{max-height:460px}.kk-grid{grid-template-columns:1fr 1fr}
}
@media(max-width:480px){
  .kk-header{min-height:60px}.kk-header nav{gap:8px}.kk-hero{padding:52px 18px}.kk-section{padding:52px 18px}
  h1{font-size:clamp(42px,13vw,64px)}.kk-grid{grid-template-columns:1fr}.kk-actions{flex-direction:column;align-items:stretch}.kk-footer{align-items:flex-start;flex-direction:column}
}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation-duration:.01ms!important;transition-duration:.01ms!important}}
${regionRules}`;
}
function standaloneHtml(model,css){
  const body=model.regions.map((region,index)=>regionMarkup(region,index,model)).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(model.title)}</title><style>${css}</style></head>
<body>${body}<script>document.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>b.animate([{transform:'scale(1)'},{transform:'scale(.97)'},{transform:'scale(1)'}],{duration:160})));<\/script></body></html>`;
}
function reactFiles(model,css){
  const body=model.regions.map((region,index)=>regionMarkup(region,index,model)).join("\n");
  const jsx=body.replaceAll("class=","className=").replace(/<script[\s\S]*?<\/script>/g,"");
  return [
    {path:"package.json",content:JSON.stringify({name:slug(model.title),private:true,scripts:{dev:"vite",build:"vite build"},dependencies:{"@vitejs/plugin-react":"latest","vite":"latest","react":"latest","react-dom":"latest"},devDependencies:{}},null,2)},
    {path:"index.html",content:'<div id="root"></div><script type="module" src="/src/main.jsx"></script>'},
    {path:"src/main.jsx",content:'import React from "react";import{createRoot}from"react-dom/client";import App from "./App.jsx";import "./styles.css";createRoot(document.getElementById("root")).render(<App/>);'},
    {path:"src/App.jsx",content:`export default function App(){return <>${jsx}</>}`},
    {path:"src/styles.css",content:css},
  ];
}
function nextFiles(model,css){
  const body=model.regions.map((region,index)=>regionMarkup(region,index,model)).join("\n").replaceAll("class=","className=");
  return [
    {path:"package.json",content:JSON.stringify({name:slug(model.title),private:true,scripts:{dev:"next dev",build:"next build",start:"next start"},dependencies:{next:"latest",react:"latest","react-dom":"latest"}},null,2)},
    {path:"app/layout.jsx",content:'import "./globals.css";export const metadata={title:"Generated Design"};export default function RootLayout({children}){return <html lang="en"><body>{children}</body></html>}'},
    {path:"app/page.jsx",content:`export default function Page(){return <>${body}</>}`},
    {path:"app/globals.css",content:css},
  ];
}
function outputFiles(model,css,output,html){
  if(output==="react") return reactFiles(model,css);
  if(output==="next") return nextFiles(model,css);
  return [{path:"index.html",content:html}];
}

function portableProjectAssets(projectContext, profile){
  if(profile?.mode!=="new") return [];
  const rows=arr(projectContext?.files);
  const out=[];
  const seen=new Set();
  for(const file of rows){
    if(!file?.base64 || !/\.(png|jpe?g|webp|avif|gif|svg|ico|mp4|webm|woff2?|ttf|otf)$/i.test(file?.name||file?.path||"")) continue;
    const normalized=String(file.path||file.name||"").replaceAll("\\","/");
    const base=normalized.split("/").pop();
    let target=/^public\//i.test(normalized) ? normalized : "public/assets/"+base;
    target=target.replace(/^\/+|\.\.\//g,"");
    if(seen.has(target)) continue;
    seen.add(target);
    out.push({path:target,content:String(file.base64),encoding:"base64"});
    if(out.length>=30) break;
  }
  return out;
}

function stylePathFor(profile){
  const target=String(profile?.targetPath||"").replaceAll("\\","/");
  const dir=target.includes("/") ? target.slice(0,target.lastIndexOf("/")+1) : "";
  if(profile?.stack==="next") return dir+"reference-design.css";
  if(profile?.stack==="react") return dir+"ReferenceDesign.css";
  return "";
}

function projectPatchFiles(model,css,profile,output,html){
  if(profile?.mode!=="existing") return outputFiles(model,css,output,html);
  const target=profile.targetPath || (output==="html" ? "reference-design.html" : output==="next" ? "app/page.jsx" : "src/components/ReferenceDesign.jsx");
  if(output==="html") return [{path:target,content:html}];
  const source=output==="next" ? nextFiles(model,css).find(x=>x.path==="app/page.jsx") : reactFiles(model,css).find(x=>x.path==="src/App.jsx");
  const stylePath=stylePathFor(profile);
  let sourceText=source?.content || "";
  if(output==="next") sourceText='import "./reference-design.css";\n'+sourceText;
  else sourceText='import "./ReferenceDesign.css";\n'+sourceText;
  return [
    {path:target,content:sourceText},
    {path:stylePath,content:css},
  ];
}

function crc32(buf){
  let crc=0xffffffff;
  for(const byte of buf){
    crc^=byte;
    for(let k=0;k<8;k++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function zipStore(files){
  const locals=[],centrals=[];
  let offset=0;
  for(const file of files){
    const name=Buffer.from(file.path.replaceAll("\\","/"));
    const data=file.encoding==="base64" ? Buffer.from(file.content,"base64") : Buffer.from(file.content,"utf8");
    const crc=crc32(data);
    const local=Buffer.alloc(30+name.length);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0,6);local.writeUInt16LE(0,8);
    local.writeUInt16LE(0,10);local.writeUInt16LE(0,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);local.writeUInt16LE(0,28);name.copy(local,30);
    locals.push(local,data);
    const central=Buffer.alloc(46+name.length);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0,8);central.writeUInt16LE(0,10);
    central.writeUInt16LE(0,12);central.writeUInt16LE(0,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);
    central.writeUInt16LE(name.length,28);central.writeUInt16LE(0,30);central.writeUInt16LE(0,32);central.writeUInt16LE(0,34);central.writeUInt16LE(0,36);central.writeUInt32LE(0,38);central.writeUInt32LE(offset,42);name.copy(central,46);
    centrals.push(central);
    offset+=local.length+data.length;
  }
  const centralSize=centrals.reduce((n,b)=>n+b.length,0);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(0,4);end.writeUInt16LE(0,6);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);
  end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);end.writeUInt16LE(0,20);
  return Buffer.concat([...locals,...centrals,end]);
}

export function compileNoCodeDesign({evidence:inputEvidence,markdown="",options={},projectContext=null}={}){
  const evidence=parseEvidence(inputEvidence);
  const projectProfile=projectContext ? analyzeProjectContext(projectContext) : null;
  const requestedOutput=options.output==="auto" && projectProfile ? projectProfile.supportedOutput : options.output;
  const output=ALLOWED_OUTPUTS.has(requestedOutput) ? requestedOutput : "html";
  const contentMode=ALLOWED_CONTENT.has(options.contentMode) ? options.contentMode : "placeholders";
  const fidelity=ALLOWED_FIDELITY.has(options.fidelity) ? options.fidelity : "accurate";
  if(fidelity==="accurate" && projectProfile && !projectProfile.readiness.accurateReady){
    const needed=projectProfile.readiness.questions.filter(q=>q.required).map(q=>q.label).join("; ");
    throw new Error("Accurate mode needs more project information before build: "+(needed || projectProfile.readiness.blockers.join("; ")));
  }
  const model=layoutModel(evidence,{contentMode,fidelity,markdown,projectProfile});
  const css=generatedCss(model,{fidelity});
  const previewHtml=standaloneHtml(model,css);
  const patchFiles=projectPatchFiles(model,css,projectProfile,output,previewHtml);
  const files=projectProfile?.mode==="existing"
    ? [
        ...patchFiles.map(file=>({path:"project-patch/"+file.path,content:file.content})),
        ...integrationSupportFiles(projectProfile,patchFiles),
      ]
    : [
        ...patchFiles,
        ...portableProjectAssets(projectContext,projectProfile),
        ...newProjectSupportFiles(projectProfile),
      ];
  files.push({path:"DESIGN-BUILD.json",content:JSON.stringify(model,null,2)});
  const readme=[
    "# Generated with KK-FRONTEND No-Code Design Compiler",
    "",
    "Reference: "+(model.referenceUrl||"unknown"),
    "Output: "+output,
    "Fidelity mode: "+fidelity,
    "Evidence confidence: "+(model.evidence.confidence ?? "unknown")+"%",
    "Unresolved DESIGN.md fields: "+model.evidence.unknownCount,
    "",
    projectProfile ? "Project-fit readiness: "+projectProfile.readiness.score+"%" : "Project-fit context: not supplied",
    projectProfile?.mode==="existing" ? "Use APPLY-WINDOWS.ps1 or APPLY-MAC.command to back up and integrate the project patch." : "This is a standalone generated project.",
    "",
    "This project is deterministic output from verified browser evidence plus supplied project context.",
  ].join("\n");
  files.push({path:"README.md",content:readme});
  const zip=zipStore(files);
  return {
    schema:"kk-no-code-design-build/v1",
    filename:slug(model.title)+"-"+output+".zip",
    output,
    contentMode,
    fidelity,
    previewHtml,
    files,
    zipBase64:zip.toString("base64"),
    model,
    summary:{
      regions:model.regions.length,
      evidenceConfidence:model.evidence.confidence,
      unknownCount:model.evidence.unknownCount,
      interactionEvidence:model.evidence.interactionCount,
      animationEvidence:model.evidence.animationCount,
      projectFiles:files.length,
      zipBytes:zip.length,
      projectFitScore:projectProfile?.readiness?.score ?? null,
      projectStack:projectProfile?.stack ?? null,
      accurateReady:projectProfile?.readiness?.accurateReady ?? null,
    }
  };
}
