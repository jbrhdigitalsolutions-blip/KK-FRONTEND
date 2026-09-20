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
          {selector:"header",tag:"header",role:"banner",label:"Top navigation",rect:{x:0,y:0,width:1440,height:72},style:{...baseStyle,display:"flex",position:"sticky"},interactive:false},
          {selector:"section.hero",tag:"section",className:"hero",label:"Launch your idea",rect:{x:0,y:72,width:1440,height:620},style:{...baseStyle,display:"grid"},interactive:false},
          {selector:"section.hero button",tag:"button",label:"Start",rect:{x:80,y:500,width:120,height:44},style:{...baseStyle,cursor:"pointer"},interactive:true},
          {selector:"footer",tag:"footer",label:"Footer",rect:{x:0,y:1500,width:1440,height:240},style:baseStyle,interactive:false}
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
  assert.ok(result.model.regions.some(x=>x.kind==="Hero"));
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
