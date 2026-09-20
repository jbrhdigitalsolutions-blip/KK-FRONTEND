import test from "node:test";
import assert from "node:assert/strict";
import { analyzeProjectIntake } from "../src/no-code/project-intake.mjs";
import { compileProjectAwareDesign } from "../src/no-code/project-builder.mjs";

function evidence(){
  const base={display:"block",position:"static",backgroundColor:"rgb(10,10,12)",color:"rgb(245,245,247)",fontFamily:"Inter",fontSize:"16px",fontWeight:"400",lineHeight:"24px",borderRadius:"0px"};
  const desktop=[
    {selector:"body",tag:"body",label:"body",rect:{x:0,y:0,width:1440,height:1100},style:base},
    {selector:".hero",tag:"section",className:"hero",label:"Hero",rect:{x:0,y:70,width:1440,height:620},style:{...base,position:"relative"}},
    {selector:".hero h1",tag:"h1",label:"Build your future",rect:{x:320,y:210,width:780,height:120},style:{...base,fontSize:"72px",lineHeight:"72px",fontWeight:"500"}},
    {selector:".hero button",tag:"button",label:"Start now",interactive:true,rect:{x:620,y:420,width:160,height:48},style:{...base,backgroundColor:"rgb(245,245,247)",color:"rgb(10,10,12)",borderRadius:"24px"}},
    {selector:".hero img",tag:"img",label:"Hero artwork",rect:{x:60,y:140,width:220,height:400},attrs:{src:"/images/hero.webp"},style:{...base}},
  ];
  const adapt=(width,heroHeight,fontSize)=>[
    {selector:"body",tag:"body",label:"body",rect:{x:0,y:0,width,height:1200},style:base},
    {selector:".hero",tag:"section",className:"hero",label:"Hero",rect:{x:0,y:60,width,height:heroHeight},style:{...base,position:"relative"}},
    {selector:".hero h1",tag:"h1",label:"Build your future",rect:{x:width*.18,y:180,width:width*.64,height:100},style:{...base,fontSize,lineHeight:fontSize,fontWeight:"500"}},
    {selector:".hero button",tag:"button",label:"Start now",interactive:true,rect:{x:width*.38,y:360,width:width*.24,height:44},style:{...base,borderRadius:"22px"}},
    {selector:".hero img",tag:"img",label:"Hero artwork",rect:{x:width*.05,y:120,width:width*.24,height:330},attrs:{src:"/images/hero.webp"},style:{...base}},
  ];
  return {
    schema:"kk-reference-design-evidence-compact/v2",
    capture:{referenceUrl:"https://example.com",finalUrl:"https://example.com",title:"Reference",scope:"whole",selection:[]},
    confidence:94,
    viewports:[
      {name:"desktop",viewport:{width:1440,height:900},document:{width:1440,height:1100},scopes:[desktop[0]],representativeElements:desktop.slice(1)},
      {name:"tablet",viewport:{width:820,height:1180},document:{width:820,height:1300},scopes:[adapt(820,650,"52px")[0]],representativeElements:adapt(820,650,"52px").slice(1)},
      {name:"mobile",viewport:{width:390,height:844},document:{width:390,height:1400},scopes:[adapt(390,720,"40px")[0]],representativeElements:adapt(390,720,"40px").slice(1)},
    ],
    assets:{imageCount:1,videoCount:0,svgCount:0,canvasCount:0,images:[{src:"/images/hero.webp"}],videos:[],svgs:[]},
    interactions:[],animations:[],responsiveCss:{mediaQueries:[],containerQueries:[]},
    implementationPolicy:{unknown:"UNKNOWN — DO NOT INVENT"}
  };
}

const projectFiles=[
  {path:"package.json",content:JSON.stringify({name:"demo",scripts:{dev:"vite"},dependencies:{react:"^19.0.0",vite:"^7.0.0"}})},
  {path:"pnpm-lock.yaml",content:"lockfileVersion: '9.0'"},
  {path:"src/pages/Home.tsx",content:'export default function Home(){return <main><h1>Our real headline</h1><button>Start now</button><img src="/images/hero.webp"/></main>}'},
  {path:"src/styles/home.css",content:".hero{min-height:600px}.cta{border-radius:24px}"},
  {path:"DESIGN.md",content:"# Existing Design\nUse current brand tokens."},
];

test("project intake detects stack and asks only for evidence still needed",()=>{
  const result=analyzeProjectIntake({
    evidence:evidence(),
    files:projectFiles,
    answers:{
      projectMode:"existing",projectName:"Demo",targetPage:"src/pages/Home.tsx",
      contentStrategy:"project",assetStrategy:"project",targetPlatforms:["windows","macos"]
    }
  });
  assert.equal(result.frameworkDetected,"React + Vite");
  assert.equal(result.packageManager,"pnpm");
  assert.equal(result.ready,true);
  assert.equal(result.exactReady,true);
  assert.equal(result.missing.length,0);
  assert.ok(result.content.snippets.length>0);
  assert.ok(result.content.assetRefs.some(x=>x.path==="/images/hero.webp"));
});

test("placeholder media blocks exact readiness but still permits explicit prototype mode",()=>{
  const result=analyzeProjectIntake({
    evidence:evidence(),
    files:projectFiles,
    answers:{
      projectMode:"existing",projectName:"Demo",targetPage:"src/pages/Home.tsx",
      contentStrategy:"project",assetStrategy:"placeholders",targetPlatforms:["windows"]
    }
  });
  assert.equal(result.ready,true);
  assert.equal(result.exactReady,false);
  assert.ok(result.exactBlockers.some(x=>/Media/.test(x)));
});

test("project intake rejects secret-bearing file names before analysis",()=>{
  assert.throws(
    ()=>analyzeProjectIntake({
      evidence:evidence(),
      files:[{path:".env",content:"API_KEY=do-not-read"}],
      answers:{projectMode:"existing"}
    }),
    /Sensitive project file names/
  );
});

test("project-aware compiler reconstructs measured child geometry and project-fit output",()=>{
  const result=compileProjectAwareDesign({
    evidence:evidence(),
    files:projectFiles,
    answers:{
      projectMode:"existing",projectName:"Demo",targetPage:"src/pages/Home.tsx",
      contentStrategy:"project",assetStrategy:"project",targetPlatforms:["windows","macos"]
    }
  });
  assert.equal(result.schema,"kk-project-aware-design-build/v1");
  assert.equal(result.summary.framework,"React + Vite");
  assert.ok(result.summary.measuredLayers>=3);
  assert.equal(result.summary.responsiveMatchPercent,100);
  assert.match(result.previewHtml,/Build your future|Our real headline/);
  assert.match(result.previewHtml,/data-layer=/);
  assert.match(result.previewHtml,/left:/);
  assert.ok(result.files.some(x=>x.path==="src/pages/kk-generated/Home.generated.jsx"));
  assert.ok(result.files.some(x=>x.path==="SYSTEM-REQUIREMENTS.md"));
  assert.equal(result.intake.designContext.designMd,"DESIGN.md");
  assert.ok(result.files.some(x=>x.path==="SETUP-WINDOWS.ps1"));
  assert.ok(result.files.some(x=>x.path==="setup-macos.sh"));
  assert.ok(result.files.some(x=>x.path==="SETUP-AND-RUN-WINDOWS.ps1"));
  assert.ok(result.files.some(x=>x.path==="setup-and-run-macos.sh"));
  assert.equal(Buffer.from(result.zipBase64,"base64").subarray(0,2).toString("ascii"),"PK");
});

test("new project can become exact-ready from explicit stack content and asset mapping",()=>{
  const intake=analyzeProjectIntake({
    evidence:evidence(),
    files:[],
    answers:{
      projectMode:"new",projectName:"Fresh",frameworkPreference:"Next.js",packageManagerPreference:"pnpm",
      contentStrategy:"provided",assetStrategy:"provided",assetMap:"/hero.webp",
      targetPlatforms:["windows","macos"],content:{"text-1":"Fresh headline","action-1":"Create now"}
    }
  });
  assert.equal(intake.exactReady,true);
  assert.equal(intake.effectiveFramework,"Next.js");
  assert.equal(intake.packageManager,"pnpm");

  const result=compileProjectAwareDesign({
    evidence:evidence(),files:[],
    answers:{
      projectMode:"new",projectName:"Fresh",frameworkPreference:"Next.js",packageManagerPreference:"pnpm",
      contentStrategy:"provided",assetStrategy:"provided",assetMap:"/hero.webp",
      targetPlatforms:["windows","macos"],content:{"text-1":"Fresh headline","action-1":"Create now"}
    }
  });
  assert.ok(result.files.some(x=>x.path==="app/page.jsx"));
  assert.ok(result.files.some(x=>x.path==="package.json"));
  assert.match(result.previewHtml,/Fresh headline/);
  assert.match(result.previewHtml,/hero\.webp/);
});

test("accurate build refuses incomplete project intake instead of guessing",()=>{
  assert.throws(
    ()=>compileProjectAwareDesign({evidence:evidence(),files:[],answers:{projectMode:"existing"}}),
    /not ready for an exact build/
  );
});
