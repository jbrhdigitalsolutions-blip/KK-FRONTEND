import test from "node:test";
import assert from "node:assert/strict";
import { compileNoCodeDesign } from "../src/no-code/compiler.mjs";

function evidence() {
  const baseStyle={
    display:"block",position:"static",backgroundColor:"rgb(16, 16, 18)",color:"rgb(247, 244, 239)",
    fontFamily:"Inter, system-ui, sans-serif",fontSize:"16px",borderRadius:"12px",gap:"16px",
    animationName:"none"
  };
  return {
    schema:"kk-reference-design-evidence-compact/v2",
    capture:{
      referenceUrl:"https://example.com/",
      finalUrl:"https://example.com/",
      title:"Example Design",
      scope:"selected",
      selection:[
        {selector:"header",label:"Top navigation",kind:"Header",family:"Structure"},
        {selector:"section.hero",label:"Launch your idea",kind:"Hero",family:"Structure"}
      ]
    },
    confidence:92,
    viewports:[
      {
        name:"desktop",targetViewport:{width:1440,height:900},viewport:{width:1440,height:900},
        document:{width:1440,height:1800,horizontalOverflow:false},
        scopes:[{selector:"body",tag:"body",label:"body",rect:{x:0,y:0,width:1440,height:1800},style:baseStyle}],
        representativeElements:[
          {selector:"header",parentSelector:null,ancestorSelectors:[],childIndex:0,depth:1,tag:"header",role:"banner",label:"Top navigation",text:"Top navigation",rect:{x:0,y:0,width:1440,height:72},style:{...baseStyle,display:"flex",position:"sticky"},interactive:false},
          {selector:"header nav",parentSelector:"header",ancestorSelectors:["header"],childIndex:0,depth:2,tag:"nav",label:"Primary navigation",text:"Product Pricing",rect:{x:80,y:0,width:700,height:72},style:{...baseStyle,display:"flex"},interactive:false},
          {selector:"section.hero",parentSelector:null,ancestorSelectors:[],childIndex:1,depth:1,tag:"section",className:"hero",label:"Launch your idea",text:"Launch your idea",rect:{x:0,y:72,width:1440,height:620},style:{...baseStyle,display:"grid"},interactive:false},
          {selector:"section.hero h1",parentSelector:"section.hero",ancestorSelectors:["section.hero"],childIndex:0,depth:2,tag:"h1",label:"Launch your idea",text:"Launch your idea",rect:{x:80,y:180,width:600,height:100},style:{...baseStyle,fontSize:"72px",lineHeight:"72px"},interactive:false},
          {selector:"section.hero button",parentSelector:"section.hero",ancestorSelectors:["section.hero"],childIndex:1,depth:2,tag:"button",label:"Start",text:"Start",rect:{x:80,y:500,width:120,height:44},style:{...baseStyle,cursor:"pointer"},interactive:true},
          {selector:"section.hero img",parentSelector:"section.hero",ancestorSelectors:["section.hero"],childIndex:2,depth:2,tag:"img",label:"Hero media",text:"",attrs:{alt:""},rect:{x:800,y:150,width:420,height:420},style:{...baseStyle,objectFit:"cover"},interactive:false},
          {selector:"footer",parentSelector:null,ancestorSelectors:[],childIndex:2,depth:1,tag:"footer",label:"Footer",text:"Footer",rect:{x:0,y:1500,width:1440,height:240},style:baseStyle,interactive:false}
        ]
      },
      {
        name:"tablet",targetViewport:{width:820,height:1180},viewport:{width:820,height:1180},
        document:{width:820,height:1900,horizontalOverflow:false},
        scopes:[{selector:"body",tag:"body",label:"body",rect:{x:0,y:0,width:820,height:1900},style:baseStyle}],
        representativeElements:[
          {selector:"header",tag:"header",rect:{x:0,y:0,width:820,height:64},style:{...baseStyle,display:"flex",position:"sticky"}},
          {selector:"section.hero",tag:"section",className:"hero",rect:{x:0,y:64,width:820,height:650},style:{...baseStyle,display:"grid"}},
          {selector:"footer",tag:"footer",rect:{x:0,y:1660,width:820,height:220},style:baseStyle}
        ]
      },
      {
        name:"mobile",targetViewport:{width:390,height:844},viewport:{width:390,height:844},
        document:{width:390,height:2200,horizontalOverflow:false},
        scopes:[{selector:"body",tag:"body",label:"body",rect:{x:0,y:0,width:390,height:2200},style:baseStyle}],
        representativeElements:[
          {selector:"header",tag:"header",rect:{x:0,y:0,width:390,height:60},style:{...baseStyle,display:"flex",position:"sticky"}},
          {selector:"section.hero",tag:"section",className:"hero",rect:{x:0,y:60,width:390,height:720},style:{...baseStyle,display:"block"}},
          {selector:"footer",tag:"footer",rect:{x:0,y:1980,width:390,height:200},style:baseStyle}
        ]
      }
    ],
    responsiveCss:{mediaQueries:["(min-width: 48rem)"],containerQueries:["(min-width: 30rem)"]},
    interactions:[{selector:"section.hero button",hover:{color:{before:"a",after:"b"}},focus:{}}],
    animations:[{selector:".hero",timing:{duration:300,easing:"ease",iterations:1},keyframes:[{},{}]}],
    assets:{svgCount:0,imageCount:0,videoCount:0,canvasCount:0,svgs:[],images:[],videos:[]},
    scroll:{},
    restrictions:[],
    implementationPolicy:{unknown:"UNKNOWN — DO NOT INVENT"}
  };
}

test("no-code compiler builds standalone HTML from verified evidence without an agent",()=>{
  const result=compileNoCodeDesign({
    evidence:evidence(),
    markdown:"# DESIGN.md\nPrimary: UNKNOWN — DO NOT INVENT\nSecondary: UNKNOWN — DO NOT INVENT",
    options:{output:"html",contentMode:"placeholders",fidelity:"accurate"}
  });
  assert.equal(result.schema,"kk-no-code-design-build/v1");
  assert.equal(result.output,"html");
  assert.match(result.previewHtml,/<!doctype html>/i);
  assert.match(result.previewHtml,/VERIFIED DESIGN/);
  const hero=result.model.regions.find(x=>x.kind==="Hero");
  assert.ok(hero);
  assert.ok(hero.children.some(x=>x.kind==="Button"),"measured child controls should be attached to their containing region");
  assert.match(result.previewHtml,/min-height:620px/);
  assert.equal(result.model.viewports.desktop.width,1440);
  assert.equal(result.model.viewports.tablet.width,820);
  assert.equal(result.model.viewports.mobile.width,390);
  assert.equal(result.summary.unknownCount,2);
  assert.equal(result.summary.evidenceConfidence,92);
  assert.ok(result.files.some(x=>x.path==="index.html"));
  const zip=Buffer.from(result.zipBase64,"base64");
  assert.equal(zip.subarray(0,2).toString("ascii"),"PK");
});

test("reference-label mode preserves selected semantic labels",()=>{
  const result=compileNoCodeDesign({
    evidence:evidence(),
    markdown:"# DESIGN.md",
    options:{output:"html",contentMode:"reference-labels",fidelity:"balanced"}
  });
  assert.match(result.previewHtml,/Launch your idea/);
  assert.ok(result.model.regions.some(x=>x.displayLabel==="Launch your idea"));
});

test("React project export is generated from the same deterministic model",()=>{
  const result=compileNoCodeDesign({
    evidence:evidence(),
    markdown:"# DESIGN.md",
    options:{output:"react",contentMode:"placeholders",fidelity:"accurate"}
  });
  const paths=result.files.map(x=>x.path);
  assert.ok(paths.includes("src/App.jsx"));
  assert.ok(paths.includes("src/styles.css"));
  assert.ok(paths.includes("package.json"));
  assert.ok(paths.includes("DESIGN-BUILD.json"));
  assert.match(result.files.find(x=>x.path==="src/App.jsx").content,/export default function App/);
});

test("Next.js project export is generated without coding-agent instructions",()=>{
  const result=compileNoCodeDesign({
    evidence:evidence(),
    markdown:"# DESIGN.md",
    options:{output:"next",contentMode:"placeholders",fidelity:"inspired"}
  });
  const paths=result.files.map(x=>x.path);
  assert.ok(paths.includes("app/page.jsx"));
  assert.ok(paths.includes("app/layout.jsx"));
  assert.ok(paths.includes("app/globals.css"));
  assert.equal(result.summary.projectFiles,result.files.length);
});

test("compiler rejects non-evidence input instead of guessing",()=>{
  assert.throws(()=>compileNoCodeDesign({evidence:{schema:"wrong"}}),/DESIGN-EVIDENCE/);
});


test("project-aware accurate build uses real content and exports a safe React patch",()=>{
  const projectFiles=[
    {path:"package.json",name:"package.json",text:JSON.stringify({
      name:"acme-app",
      packageManager:"pnpm@10.28.0",
      dependencies:{react:"19.0.0","react-dom":"19.0.0",vite:"7.0.0"}
    })},
    {path:"src/App.jsx",name:"App.jsx",text:'import Header from "./Header"; import Hero from "./Hero"; export default function App(){return <><Header/><Hero/></>}'},
    {path:"src/Header.jsx",name:"Header.jsx",text:"export default function Header(){return <header>Product Pricing</header>}"},
    {path:"src/Hero.jsx",name:"Hero.jsx",text:"export default function Hero(){return <main>Operate faster</main>}"},
    {path:"src/Nav.jsx",name:"Nav.jsx",text:"export default function Nav(){return <nav>Navigation</nav>}"},
    {path:"src/Card.jsx",name:"Card.jsx",text:"export default function Card(){return <article>Feature</article>}"},
    {path:"src/Footer.jsx",name:"Footer.jsx",text:"export default function Footer(){return <footer>Footer</footer>}"},
    {path:"src/Form.jsx",name:"Form.jsx",text:"export default function Form(){return <form><input/></form>}"},
    {path:"src/CTA.jsx",name:"CTA.jsx",text:"export default function CTA(){return <button>Start</button>}"},
    {path:"DESIGN.md",name:"DESIGN.md",text:"# Current design"},
    {path:"public/logo.svg",name:"logo.svg",size:100,type:"image/svg+xml"},
    {path:"public/hero.webp",name:"hero.webp",size:100,type:"image/webp"}
  ];
  const result=compileNoCodeDesign({
    evidence:evidence(),
    markdown:"# DESIGN.md",
    options:{output:"auto",contentMode:"placeholders",fidelity:"accurate"},
    projectContext:{
      mode:"existing",
      stack:"auto",
      files:projectFiles,
      brand:"Acme Cloud",
      heroTitle:"Operate faster with Acme",
      heroBody:"A real project-aware headline and body.",
      primaryCta:"Start free",
      secondaryCta:"See demo",
      navItems:"Product, Solutions, Pricing"
    }
  });
  assert.equal(result.output,"react");
  assert.match(result.previewHtml,/Operate faster with Acme/);
  assert.match(result.previewHtml,/Start free/);
  assert.match(result.previewHtml,/\/hero\.webp/);
  assert.equal(result.summary.projectStack,"react");
  assert.ok(result.summary.projectFitScore>=85);
  assert.equal(result.summary.accurateReady,true);
  assert.equal(result.summary.renderer,"hierarchy-exact");
  assert.ok(result.summary.hierarchyNodes>=6);
  assert.equal(result.previewHtml.includes("Replace this placeholder content"),false);
  assert.equal(result.previewHtml.includes(">Typography<"),false);
  const paths=result.files.map(x=>x.path);
  assert.ok(paths.some(x=>x.startsWith("project-patch/")));
  assert.ok(paths.includes("APPLY-WINDOWS.ps1"));
  assert.ok(paths.includes("APPLY-MAC.command"));
  assert.ok(paths.includes("PROJECT-FIT.json"));
  assert.ok(paths.includes("ORIGINAL-SOURCE/src/App.jsx"));
});

test("accurate build is blocked when required project context is incomplete",()=>{
  assert.throws(()=>compileNoCodeDesign({
    evidence:evidence(),
    markdown:"# DESIGN.md",
    options:{output:"auto",contentMode:"placeholders",fidelity:"accurate"},
    projectContext:{mode:"new",stack:"react",projectName:"Incomplete"}
  }),/Accurate mode needs more project information/);
});

test("new project export includes cross-platform setup scripts",()=>{
  const result=compileNoCodeDesign({
    evidence:evidence(),
    markdown:"# DESIGN.md",
    options:{output:"auto",contentMode:"placeholders",fidelity:"accurate"},
    projectContext:{
      mode:"new",
      stack:"next",
      projectName:"Fresh App",
      brand:"Fresh",
      heroTitle:"Fresh headline",
      heroBody:"Fresh body copy.",
      primaryCta:"Join now",
      navItems:"Product, Pricing, About",
      heroAsset:"/hero.webp"
    }
  });
  const paths=result.files.map(x=>x.path);
  assert.equal(result.output,"next");
  assert.ok(paths.includes("SETUP-WINDOWS.ps1"));
  assert.ok(paths.includes("SETUP-MAC.command"));
  assert.ok(paths.includes("RUN.md"));
  assert.ok(paths.includes("PROJECT-FIT.json"));
});


test("new project ZIP carries small uploaded portable assets",()=>{
  const asset=Buffer.from("fake-webp-bytes").toString("base64");
  const result=compileNoCodeDesign({
    evidence:evidence(),
    markdown:"# DESIGN.md",
    options:{output:"auto",contentMode:"placeholders",fidelity:"accurate"},
    projectContext:{
      mode:"new",
      stack:"react",
      projectName:"Asset App",
      brand:"Asset",
      heroTitle:"Visual headline",
      heroBody:"Real copy.",
      primaryCta:"Start",
      navItems:"Home, Product",
      files:[{path:"hero.webp",name:"hero.webp",size:15,type:"image/webp",base64:asset}]
    }
  });
  assert.equal(result.model.project.assetMap.heroAsset,"/assets/hero.webp");
  const portable=result.files.find(x=>x.path==="public/assets/hero.webp");
  assert.ok(portable);
  assert.equal(portable.encoding,"base64");
  assert.equal(portable.content,asset);
  assert.match(result.previewHtml,/\/assets\/hero\.webp/);
});


test("Accurate renderer preserves measured hierarchy while substituting target-owned content",()=>{
  const projectFiles=[
    {path:"package.json",name:"package.json",text:JSON.stringify({name:"deep-app",packageManager:"pnpm@10.28.0",dependencies:{react:"19.0.0",vite:"7.0.0"}})},
    ...["App","Header","Hero","Nav","Card","Footer","Form","CTA"].map(name=>({path:`src/${name}.jsx`,name:`${name}.jsx`,text:`export default function ${name}(){return <div>${name} project content</div>}`})),
    {path:"DESIGN.md",name:"DESIGN.md",text:"# Design"},
    {path:"public/hero.webp",name:"hero.webp",size:100,type:"image/webp"}
  ];
  const result=compileNoCodeDesign({
    evidence:evidence(),markdown:"# DESIGN.md",
    options:{output:"auto",contentMode:"placeholders",fidelity:"accurate"},
    projectContext:{
      mode:"existing",stack:"auto",files:projectFiles,brand:"Deep App",
      heroTitle:"Target headline",heroBody:"Target body",primaryCta:"Target action",navItems:"Workspace, Pricing"
    }
  });
  assert.equal(result.summary.renderer,"hierarchy-exact");
  assert.match(result.previewHtml,/kk-node-/);
  assert.match(result.previewHtml,/Target headline/);
  assert.match(result.previewHtml,/Target action/);
  assert.equal(result.previewHtml.includes("Launch your idea"),false,"reference literal copy must not become target content");
  assert.equal(result.previewHtml.includes("Evidence-led content placeholder"),false);
});
