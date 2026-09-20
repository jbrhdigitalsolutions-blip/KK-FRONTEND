const TEXT_EXTENSIONS = new Set([
  ".md",".mdx",".txt",".json",".js",".mjs",".cjs",".jsx",".ts",".tsx",".css",".scss",".sass",".less",
  ".html",".htm",".vue",".svelte",".astro",".yaml",".yml",".toml",".env.example"
]);

const IMPORTANT_NAMES = new Set([
  "package.json","pnpm-lock.yaml","package-lock.json","yarn.lock","bun.lockb",
  "vite.config.js","vite.config.mjs","vite.config.ts","next.config.js","next.config.mjs","next.config.ts",
  "tailwind.config.js","tailwind.config.cjs","tailwind.config.mjs","tailwind.config.ts",
  "postcss.config.js","postcss.config.cjs","postcss.config.mjs","postcss.config.ts",
  "tsconfig.json","jsconfig.json","design.md","readme.md"
]);

function arr(value){ return Array.isArray(value) ? value : []; }
function str(value){ return String(value ?? "").trim(); }
function lower(value){ return str(value).toLowerCase(); }
function ext(path=""){
  const name=String(path).split("/").pop()||"";
  const i=name.lastIndexOf(".");
  return i>=0 ? name.slice(i).toLowerCase() : "";
}
function safePath(value){
  const p=str(value).replaceAll("\\","/").replace(/^\/+|\/+$/g,"");
  if(!p || p.includes("\0") || p.split("/").some(x=>x===".." || x===".")) throw new Error("Uploaded project file path is invalid.");
  return p.slice(0,500);
}
function bytes(value){ return Buffer.byteLength(String(value??""),"utf8"); }
function uniq(values){ return [...new Set(values.filter(Boolean))]; }
function fileByName(files,name){ return files.find(f=>f.path.toLowerCase().endsWith("/"+name)||f.path.toLowerCase()===name); }
function includesAny(text,needles){ const x=lower(text); return needles.some(n=>x.includes(n)); }

export function normalizeProjectFiles(input=[]){
  const files=[];
  let total=0;
  for(const raw of arr(input).slice(0,160)){
    const path=safePath(raw?.path || raw?.name);
    const name=path.split("/").pop();
    const extension=ext(path);
    const important=IMPORTANT_NAMES.has(name.toLowerCase());
    if(!important && !TEXT_EXTENSIONS.has(extension)) continue;
    const content=String(raw?.content ?? "");
    const size=bytes(content);
    if(size>900_000) throw new Error(`Project file is too large for web analysis: ${path}`);
    total+=size;
    if(total>8_000_000) throw new Error("Uploaded project text exceeds the 8 MB analysis budget. Upload only frontend/design-related files.");
    files.push({path,name,extension,size,content});
  }
  return files;
}

function packageProfile(files){
  const pkgFile=fileByName(files,"package.json");
  let pkg=null;
  if(pkgFile){
    try{pkg=JSON.parse(pkgFile.content);}catch{}
  }
  const deps={...(pkg?.dependencies||{}),...(pkg?.devDependencies||{})};
  const names=Object.keys(deps);
  const has=x=>names.includes(x);
  let framework="Unknown";
  if(has("next")) framework="Next.js";
  else if(has("@remix-run/react")) framework="Remix";
  else if(has("astro")) framework="Astro";
  else if(has("vue")) framework="Vue";
  else if(has("svelte")||has("@sveltejs/kit")) framework="Svelte";
  else if(has("react")) framework=has("vite")?"React + Vite":"React";
  else if(files.some(f=>f.extension===".html")) framework="HTML/CSS/JS";

  let packageManager="unknown";
  if(fileByName(files,"pnpm-lock.yaml")) packageManager="pnpm";
  else if(fileByName(files,"yarn.lock")) packageManager="yarn";
  else if(fileByName(files,"bun.lockb")) packageManager="bun";
  else if(fileByName(files,"package-lock.json")) packageManager="npm";
  else if(str(pkg?.packageManager)) packageManager=str(pkg.packageManager).split("@")[0];

  const styling=[];
  if(has("tailwindcss")||files.some(f=>f.name.toLowerCase().startsWith("tailwind.config"))) styling.push("Tailwind CSS");
  if(has("styled-components")) styling.push("styled-components");
  if(has("@emotion/react")||has("@emotion/styled")) styling.push("Emotion");
  if(files.some(f=>/\.module\.(css|scss|sass|less)$/i.test(f.path))) styling.push("CSS Modules");
  if(files.some(f=>[".scss",".sass"].includes(f.extension))) styling.push("Sass");
  if(files.some(f=>f.extension===".css")) styling.push("CSS");

  const language=files.some(f=>[".ts",".tsx"].includes(f.extension)) || Boolean(pkg?.devDependencies?.typescript) ? "TypeScript" : "JavaScript";
  const scripts=pkg?.scripts||{};

  return {packageJson:pkg,framework,packageManager,styling:uniq(styling),language,scripts,dependencies:names};
}

function structureProfile(files){
  const paths=files.map(f=>f.path);
  const findRoot=(names)=>names.find(root=>paths.some(p=>p===root||p.startsWith(root+"/")))||null;
  const sourceRoot=findRoot(["src","app","pages","client","frontend","web"]);
  const componentRoot=findRoot(["src/components","app/components","components","src/ui","ui"]);
  const routeRoot=findRoot(["src/app","app","src/pages","pages","src/routes","routes"]);
  const styleFiles=files.filter(f=>[".css",".scss",".sass",".less"].includes(f.extension)).map(f=>f.path);
  const designFiles=files.filter(f=>/design|theme|token|style|tailwind|brand/i.test(f.path)).map(f=>f.path);
  const configFiles=files.filter(f=>/config|package\.json|tsconfig|jsconfig/i.test(f.path)).map(f=>f.path);
  const designMd=files.find(f=>f.name.toLowerCase()==="design.md")||null;
  return {sourceRoot,componentRoot,routeRoot,styleFiles,designFiles,configFiles,designMd:designMd?designMd.path:null};
}

function contentProfile(files){
  const source=files.filter(f=>[".jsx",".tsx",".vue",".svelte",".astro",".html",".js",".ts"].includes(f.extension)).slice(0,60);
  const snippets=[];
  const assetRefs=[];
  for(const file of source){
    const text=file.content.replace(/\s+/g," ");
    const matches=[...text.matchAll(/>([^<>]{3,120})</g)].slice(0,8);
    for(const m of matches){
      const value=m[1].replace(/\{[^}]*\}/g,"").trim();
      if(value && !/[{};]/.test(value)) snippets.push({file:file.path,text:value.slice(0,120)});
      if(snippets.length>=40) break;
    }
    const refs=[...text.matchAll(/(?:src=|url\(|from\s+|import\s+)[^"'()]*["']([^"']+\.(?:png|jpe?g|webp|svg|gif|avif|mp4|webm))["']/gi)].slice(0,10);
    for(const ref of refs) assetRefs.push({file:file.path,path:ref[1].slice(0,240)});
    if(snippets.length>=40 && assetRefs.length>=40) break;
  }
  return {snippets,assetRefs:assetRefs.slice(0,60)};
}

function evidenceNeeds(evidence){
  let parsed=evidence;
  if(typeof evidence==="string"){try{parsed=JSON.parse(evidence);}catch{parsed={};}}
  const nodes=arr(parsed?.viewports?.find(v=>v.name==="desktop")?.representativeElements);
  const kinds=new Set(nodes.map(n=>lower(n.tag)));
  const labels=nodes.map(n=>lower(n.label)).join(" ");
  const assetCounts=parsed?.assets||{};
  return {
    hasImages:Number(assetCounts.imageCount||0)>0 || kinds.has("img") || kinds.has("picture"),
    hasVideo:Number(assetCounts.videoCount||0)>0 || kinds.has("video"),
    hasForms:["input","textarea","select","form","button"].some(k=>kinds.has(k)),
    hasNavigation:kinds.has("nav") || /navigation|menu/.test(labels),
    hasTypography:nodes.some(n=>/^h[1-6]$/.test(lower(n.tag)) || lower(n.tag)==="p"),
  };
}

function answerValue(answers,key){ return str(answers?.[key]); }

export function analyzeProjectIntake({evidence,files:rawFiles=[],answers={}}={}){
  const files=normalizeProjectFiles(rawFiles);
  const pkg=packageProfile(files);
  const structure=structureProfile(files);
  const content=contentProfile(files);
  const needs=evidenceNeeds(evidence);
  const projectMode=answerValue(answers,"projectMode") || (files.length ? "existing" : "new");
  const targetPage=answerValue(answers,"targetPage");
  const projectName=answerValue(answers,"projectName");
  const contentStrategy=answerValue(answers,"contentStrategy");
  const assetStrategy=answerValue(answers,"assetStrategy");
  const targetPlatforms=arr(answers?.targetPlatforms).filter(x=>["windows","macos"].includes(x));
  const frameworkPreference=answerValue(answers,"frameworkPreference");
  const packageManagerPreference=answerValue(answers,"packageManagerPreference");
  const detectedFramework=pkg.framework;
  const detected=detectedFramework!=="Unknown";
  const effectiveFramework=projectMode==="existing"
    ? (detected ? detectedFramework : (frameworkPreference||"Unknown"))
    : (frameworkPreference||"HTML/CSS/JS");
  const effectivePackageManager=pkg.packageManager!=="unknown"
    ? pkg.packageManager
    : (packageManagerPreference||"unknown");

  const requirements=[];
  const add=(id,label,status,why,required=true)=>requirements.push({id,label,status,why,required});

  add("projectName","Project name",projectName?"complete":"missing","Names the generated package and integration manifest.");
  if(projectMode==="existing"){
    add("projectFiles","Current frontend/project files",files.length>=2?"complete":"missing","Needed to detect framework, dependencies, file layout and styling conventions.");
    add("techStack","Project tech stack",(detected||frameworkPreference)?"complete":"missing","Accurate source must match the user's actual framework and build tool.");
    add("targetPage","Target page/route",targetPage?"complete":"missing","Needed to place generated source in the correct route/component location.");
  } else {
    add("frameworkPreference","Output framework",frameworkPreference?"complete":"missing","Needed to produce the requested project structure.");
    add("packageManagerPreference","Package manager",(effectivePackageManager!=="unknown")?"complete":"missing","Needed to generate install/run scripts for the user's PC.");
  }

  add("contentStrategy","Text/content source",contentStrategy?"complete":"missing","Choose project text, supplied text, reference labels, or placeholders.");
  if(contentStrategy==="project"){
    add("projectContent","Current target-page text",content.snippets.length?"complete":"missing","Project content mode needs the current page/component source so real text can be reused.");
  }
  if(contentStrategy==="provided" && needs.hasTypography){
    add("providedHeadline","Main page text",str(answers?.content?.["text-1"])?"complete":"missing","The selected design contains typography; provide the main headline/text to place into the measured layout.");
  }
  if(contentStrategy==="provided" && needs.hasForms){
    add("providedAction","Primary action text",str(answers?.content?.["action-1"])?"complete":"missing","The selected design contains controls; provide the primary action label.");
  }
  if(needs.hasImages||needs.hasVideo){
    add("assetStrategy","Image/video assets",assetStrategy?"complete":"missing","Reference contains media; choose existing project assets, provide asset paths, or explicitly use placeholders.");
    if(assetStrategy==="project"){
      add("projectAssets","Existing asset references",content.assetRefs.length?"complete":"missing","Project asset mode needs source files that reference the images/video used by the target page.");
    }
    if(assetStrategy==="provided"){
      add("assetMap","Asset path mapping",str(answers?.assetMap)?"complete":"missing","List the project/public asset paths that should fill the measured media slots.");
    }
  }
  add("targetPlatforms","Target PC platform",targetPlatforms.length?"complete":"missing","Generates correct Windows/macOS install and run helpers.");
  add("designFiles","Existing design system",structure.designFiles.length||structure.designMd?"complete":"recommended","Existing DESIGN.md/theme/token/style files improve project fit.",false);

  const missing=requirements.filter(x=>x.required&&x.status==="missing");
  const required=requirements.filter(x=>x.required);
  const complete=required.length-missing.length;
  const readiness=Math.round((complete/Math.max(1,required.length))*100);
  const exactBlockers=[];
  if(contentStrategy==="placeholders" && needs.hasTypography) exactBlockers.push("Text is set to placeholders.");
  if(assetStrategy==="placeholders" && (needs.hasImages||needs.hasVideo)) exactBlockers.push("Media is set to asset placeholders.");
  const exactReady=missing.length===0 && exactBlockers.length===0;

  const recommendations=[];
  if(projectMode==="existing"&&!structure.designMd) recommendations.push("Upload your current DESIGN.md if one exists.");
  if(projectMode==="existing"&&!fileByName(files,"package.json")) recommendations.push("Upload package.json and the matching lockfile.");
  if(projectMode==="existing"&&structure.styleFiles.length===0) recommendations.push("Upload the page/component CSS, CSS module, Tailwind/theme, or global stylesheet files.");
  if(content.snippets.length===0&&contentStrategy==="project") recommendations.push("Upload the current target page/component files so project text can be reused.");
  if((needs.hasImages||needs.hasVideo)&&assetStrategy==="project"&&!content.assetRefs.length) recommendations.push("Upload the current page/component source that references its images/video, or switch to Provided asset paths.");

  return {
    schema:"kk-project-intake/v1",
    ready:missing.length===0,
    exactReady,
    exactBlockers,
    readinessPercent:readiness,
    projectMode,
    projectName:projectName||null,
    targetPage:targetPage||null,
    targetPlatforms,
    effectiveFramework,
    packageManager:effectivePackageManager,
    language:pkg.language,
    styling:pkg.styling,
    frameworkDetected:pkg.framework,
    fileCount:files.length,
    analyzedBytes:files.reduce((n,f)=>n+f.size,0),
    structure,
    content,
    evidenceNeeds:needs,
    requirements,
    missing:missing.map(x=>x.id),
    recommendations,
    projectProfile:{
      framework:effectiveFramework,
      detectedFramework:pkg.framework,
      packageManager:effectivePackageManager,
      language:pkg.language,
      styling:pkg.styling,
      scripts:pkg.scripts,
      sourceRoot:structure.sourceRoot,
      componentRoot:structure.componentRoot,
      routeRoot:structure.routeRoot,
      targetPage:targetPage||null,
      projectName:projectName||null,
      projectMode,
      contentStrategy:contentStrategy||null,
      assetStrategy:assetStrategy||null,
      assetMap:str(answers?.assetMap)||null,
      targetPlatforms,
      existingDependencies:pkg.dependencies,
      projectNotes:answerValue(answers,"projectNotes")||null,
    }
  };
}

export function projectFileSummary(files=[]){
  return normalizeProjectFiles(files).map(({path,size})=>({path,size}));
}
