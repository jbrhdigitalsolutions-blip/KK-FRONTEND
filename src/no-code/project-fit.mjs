const TEXT_EXTENSIONS = new Set([
  ".json",".md",".txt",".html",".htm",".css",".scss",".sass",".less",
  ".js",".jsx",".mjs",".cjs",".ts",".tsx",".vue",".svelte",
  ".yaml",".yml",".toml",".env.example"
]);

function text(value, fallback="") {
  const out=String(value ?? "").trim();
  return out || fallback;
}
function arr(value){ return Array.isArray(value) ? value : []; }
function pathNorm(value){ return String(value||"").replaceAll("\\","/").replace(/^\.\//,"").replace(/^\/+|\/+$/g,""); }
function ext(path){
  const name=pathNorm(path).split("/").pop()||"";
  const i=name.lastIndexOf(".");
  return i>=0 ? name.slice(i).toLowerCase() : "";
}
function parseJson(value){
  try { return JSON.parse(String(value||"")); } catch { return null; }
}
function unique(values){ return [...new Set(values.filter(Boolean))]; }
function cleanList(value){
  if(Array.isArray(value)) return value.map(x=>text(x)).filter(Boolean).slice(0,12);
  return String(value||"").split(/[\n,]/).map(x=>x.trim()).filter(Boolean).slice(0,12);
}
function fileBy(files, predicate){ return files.find(predicate); }

const SECRET_OR_PRIVATE_PATH=/(^|\/)(\.env(?:\.|$)|id_rsa|id_ed25519|.*\.(?:pem|key|p12|pfx)|credentials?(?:\.|$)|secrets?(?:\.|$))/i;
const SKIP_PROJECT_PATH=/(^|\/)(node_modules|\.git|\.next|dist|build|coverage|\.cache|vendor)(\/|$)/i;

function normalizeFiles(input=[]){
  return arr(input).slice(0,500).filter(file=>{
    const p=pathNorm(file?.path || file?.webkitRelativePath || file?.name);
    return p && !SECRET_OR_PRIVATE_PATH.test(p) && !SKIP_PROJECT_PATH.test(p);
  }).slice(0,220).map(file=>({
    path:pathNorm(file?.path || file?.webkitRelativePath || file?.name),
    name:text(file?.name || pathNorm(file?.path).split("/").pop()),
    size:Number(file?.size)||0,
    type:text(file?.type),
    text:typeof file?.text==="string" ? file.text.slice(0,300_000) : "",
  })).filter(x=>x.path);
}

function packageInfo(files){
  const rows=files.filter(x=>/(^|\/)package\.json$/i.test(x.path)).map(file=>{
    const pkg=parseJson(file.text); if(!pkg)return null;
    const deps={...(pkg.dependencies||{}),...(pkg.devDependencies||{})};
    let score=0;
    if(deps.next)score+=100;
    if(deps.react)score+=70;
    if(deps.vue||deps.nuxt||deps.svelte||deps["@sveltejs/kit"])score+=65;
    if(deps.vite)score+=35;
    if(/(?:^|\/)(web|frontend|client|app)(?:\/|$)/i.test(file.path))score+=25;
    score-=file.path.split("/").length;
    return{file:file.path,root:file.path.includes("/")?file.path.slice(0,file.path.lastIndexOf("/")):"",pkg,deps,score};
  }).filter(Boolean).sort((a,b)=>b.score-a.score||a.file.localeCompare(b.file));
  return rows[0]||{file:null,root:"",pkg:null,deps:{},score:0};
}

function detectStack(files,pkgInfo,requested="auto"){
  if(requested && requested!=="auto") return requested;
  const deps=pkgInfo.deps||{};
  const paths=files.map(x=>x.path.toLowerCase());
  if(deps.next || paths.some(x=>/(^|\/)app\/.+page\.(jsx?|tsx?)$/.test(x) || /(^|\/)pages\/.+\.(jsx?|tsx?)$/.test(x))) return "next";
  if(deps.react || deps.vite || paths.some(x=>/\.(jsx|tsx)$/.test(x))) return "react";
  if(deps.vue || paths.some(x=>x.endsWith(".vue"))) return "vue";
  if(deps.svelte || deps["@sveltejs/kit"] || paths.some(x=>x.endsWith(".svelte"))) return "svelte";
  if(paths.some(x=>x.endsWith(".html"))) return "html";
  return "unknown";
}

function detectPackageManager(files,pkgInfo){
  const paths=new Set(files.map(x=>x.path.toLowerCase()));
  const declared=text(pkgInfo.pkg?.packageManager).split("@")[0];
  if(["pnpm","npm","yarn","bun"].includes(declared)) return declared;
  if(paths.has("pnpm-lock.yaml")) return "pnpm";
  if(paths.has("yarn.lock")) return "yarn";
  if(paths.has("bun.lockb") || paths.has("bun.lock")) return "bun";
  if(paths.has("package-lock.json")) return "npm";
  return pkgInfo.pkg ? "npm" : "none";
}

function detectStyling(files,pkgInfo){
  const deps=pkgInfo.deps||{};
  const paths=files.map(x=>x.path.toLowerCase());
  const out=[];
  if(deps.tailwindcss || deps["@tailwindcss/vite"] || paths.some(x=>x.includes("tailwind.config"))) out.push("tailwind");
  if(deps["styled-components"]) out.push("styled-components");
  if(deps["@emotion/react"]) out.push("emotion");
  if(paths.some(x=>x.endsWith(".module.css") || x.endsWith(".module.scss"))) out.push("css-modules");
  if(paths.some(x=>x.endsWith(".scss") || x.endsWith(".sass"))) out.push("scss");
  if(paths.some(x=>x.endsWith(".css"))) out.push("css");
  return unique(out).length ? unique(out) : ["unknown"];
}

function detectTypeScript(files,pkgInfo){
  return Boolean(pkgInfo.deps?.typescript || files.some(x=>/\.(ts|tsx)$/.test(x.path)));
}

function stripRoot(filePath,root){
  const p=pathNorm(filePath),r=pathNorm(root);
  return r&&p.startsWith(r+"/")?p.slice(r.length+1):p;
}
function detectRoutes(files,stack,packageRoot=""){
  const paths=files.map(x=>stripRoot(x.path,packageRoot));
  const routes=[];
  if(stack==="next"){
    for(const p of paths){
      let m=p.match(/^app\/(.*)\/page\.(?:js|jsx|ts|tsx)$/);
      if(m) routes.push("/"+m[1].replace(/\([^/]+\)\//g,"").replace(/\[([^\]]+)\]/g,":$1"));
      if(/^app\/page\.(?:js|jsx|ts|tsx)$/.test(p))routes.push("/");
      m=p.match(/^pages\/(.*)\.(?:js|jsx|ts|tsx)$/);
      if(m && !m[1].startsWith("_")) routes.push("/"+m[1].replace(/\/index$/,"").replace(/\[([^\]]+)\]/g,":$1"));
    }
  }
  return unique(routes).slice(0,80);
}

function designDocs(files){
  return files.filter(x=>/(^|\/)(design|style|brand|ui|ux|theme|tokens?)[^/]*\.(md|json|css|scss|txt)$/i.test(x.path)).map(x=>x.path).slice(0,30);
}
function sourceFiles(files){
  return files.filter(x=>/\.(jsx?|tsx?|vue|svelte|html|css|scss)$/.test(x.path)).map(x=>x.path).slice(0,80);
}
function assetFiles(files){
  return files.filter(x=>/\.(png|jpe?g|webp|avif|gif|svg|ico|mp4|webm|woff2?|ttf|otf)$/i.test(x.path)).map(x=>x.path).slice(0,120);
}
function publicAssetUrl(path){
  const p=pathNorm(path);
  if(/^public\//i.test(p)) return "/"+p.replace(/^public\//i,"");
  if(/^static\//i.test(p)) return "/"+p.replace(/^static\//i,"");
  return "";
}
function bestAsset(assets, words){
  return assets.find(path=>words.some(w=>path.toLowerCase().includes(w))) || "";
}

function joinRoot(root,rel){
  const r=pathNorm(root),p=pathNorm(rel);
  return r?r+"/"+p:p;
}
function defaultTargetPath(stack,isTs,route,files=[],packageRoot=""){
  const cleanRoute=String(route||"/").replace(/^\/+|\/+$/g,"");
  if(stack==="next"){
    const extensions=isTs?["tsx","ts","jsx","js"]:["jsx","js","tsx","ts"];
    for(const extension of extensions){
      const rel=(cleanRoute?"app/"+cleanRoute+"/":"app/")+"page."+extension;
      const exact=files.find(x=>x.path===joinRoot(packageRoot,rel));
      if(exact)return exact.path;
    }
    return joinRoot(packageRoot,(cleanRoute?"app/"+cleanRoute+"/":"app/")+"page."+(isTs?"tsx":"jsx"));
  }
  if(stack==="react"){
    const prefix=packageRoot?pathNorm(packageRoot)+"/":"";
    const app=files.find(x=>x.path.startsWith(prefix+"src/App.")&&/\.(?:js|jsx|ts|tsx)$/i.test(x.path));
    if(app)return app.path;
    return joinRoot(packageRoot,"src/App."+(isTs?"tsx":"jsx"));
  }
  const html=files.find(x=>/(^|\/)index\.html$/i.test(x.path));
  return html?.path || joinRoot(packageRoot,"reference-design.html");
}

function sourceIntelligence(files,packageRoot=""){
  const source=files.filter(x=>/\.(?:js|jsx|ts|tsx|vue|svelte|html)$/i.test(x.path)&&x.text);
  const components=[],imports={},strings=[],assetRefs=[],hrefs=[];
  for(const file of source){
    const body=String(file.text||"");
    const exports=[...body.matchAll(/\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map(m=>m[1]);
    const imported=[...body.matchAll(/\bimport\s+(?:[^"'\n]+?\s+from\s+)?["']([^"']+)["']/g)].map(m=>m[1]);
    if(imported.length)imports[file.path]=unique(imported).slice(0,80);
    if(/\.(?:jsx|tsx|vue|svelte)$/.test(file.path)){
      const roles=[
        /header|topbar/i.test(body)?"header":null,
        /sidebar|sidenav/i.test(body)?"sidebar":null,
        /\bnav\b|navigation|menu/i.test(body)?"navigation":null,
        /form|input|textarea/i.test(body)?"form":null,
        /dashboard|workspace/i.test(body)?"workspace":null,
        /hero/i.test(body)?"hero":null
      ].filter(Boolean);
      components.push({path:file.path,exports:unique(exports).slice(0,30),roles});
    }
    for(const m of body.matchAll(/["'`]([^"'\`{}<>]{3,120})["'`]/g)){
      const v=m[1].trim();
      if(/[A-Za-z]{2}/.test(v)&&!/^https?:|^\.|^\/|^[A-Za-z0-9_-]+\.[A-Za-z]{2,5}$/.test(v))strings.push(v);
      if(strings.length>=400)break;
    }
    for(const m of body.matchAll(/(?:src|poster)\s*=\s*["'`]([^"'\`]+)["'`]/g))assetRefs.push(m[1]);
    for(const m of body.matchAll(/href\s*=\s*["'`]([^"'\`]+)["'`]/g))hrefs.push(m[1]);
  }
  return{
    scannedFiles:source.length,
    components:components.slice(0,160),
    imports,
    contentStrings:unique(strings).slice(0,240),
    assetReferences:unique(assetRefs).slice(0,200),
    hrefs:unique(hrefs).slice(0,200),
  };
}
function websiteContent(input={}){
  const w=input.websiteEvidence||{};
  return{
    title:text(w.title).slice(0,160),
    description:text(w.description).slice(0,400),
    headings:arr(w.headings).map(x=>text(x)).filter(Boolean).slice(0,80),
    buttons:arr(w.buttons).map(x=>text(x)).filter(Boolean).slice(0,80),
    navItems:arr(w.navItems).map(x=>text(x)).filter(Boolean).slice(0,40),
    paragraphs:arr(w.paragraphs).map(x=>text(x)).filter(Boolean).slice(0,80),
    images:arr(w.images).slice(0,120),
    url:text(w.url).slice(0,500),
    scanned:Boolean(w.schema),
  };
}

function question(id,label,reason,kind="text",required=true){
  return {id,label,reason,kind,required};
}

export function analyzeProjectContext(input={}){
  const files=normalizeFiles(input.files);
  const pkgInfo=packageInfo(files);
  const requestedStack=text(input.stack,"auto").toLowerCase();
  const stack=detectStack(files,pkgInfo,requestedStack);
  const detectedPackageManager=detectPackageManager(files,pkgInfo);
  const isTypeScript=detectTypeScript(files,pkgInfo);
  const styling=detectStyling(files,pkgInfo);
  const packageRoot=pkgInfo.root||"";
  const routes=detectRoutes(files,stack,packageRoot);
  const assets=assetFiles(files);
  const docs=designDocs(files);
  const sources=sourceFiles(files);
  const mode=["existing","new"].includes(input.mode) ? input.mode : (files.length ? "existing" : "new");
  const projectName=text(input.projectName,pkgInfo.pkg?.name || "my-project").slice(0,100);
  const targetRoute=text(input.targetRoute,routes[0] || "/").slice(0,240);
  const targetPath=text(input.targetPath,defaultTargetPath(stack,isTypeScript,targetRoute,files,packageRoot)).slice(0,300);
  const web=websiteContent(input);
  const intelligence=sourceIntelligence(files,packageRoot);
  const manualNav=cleanList(input.navItems);
  const nav=manualNav.length?manualNav:web.navItems.slice(0,8);
  const content={
    brand:text(input.brand,web.title||projectName).slice(0,120),
    heroTitle:text(input.heroTitle,web.headings[0]||"").slice(0,240),
    heroBody:text(input.heroBody,web.description||web.paragraphs[0]||"").slice(0,600),
    primaryCta:text(input.primaryCta,web.buttons[0]||"").slice(0,100),
    secondaryCta:text(input.secondaryCta).slice(0,100),
    navItems:nav,
    footerText:text(input.footerText).slice(0,300),
  };
  const heroCandidate=bestAsset(assets,["hero","banner","cover","landing"]);
  const logoCandidate=bestAsset(assets,["logo","brand","mark"]);
  const portableUrl=assetPath=>{
    if(!assetPath) return "";
    const publicUrl=publicAssetUrl(assetPath);
    if(publicUrl) return publicUrl;
    if(mode==="new") return "/assets/"+pathNorm(assetPath).split("/").pop();
    return "";
  };
  const heroAsset=text(input.heroAsset || portableUrl(heroCandidate)).slice(0,500);
  const logoAsset=text(input.logoAsset || portableUrl(logoCandidate)).slice(0,500);
  const blockers=[];
  const questions=[];

  if(stack==="unknown") {
    blockers.push("Target frontend stack is unknown.");
    questions.push(question("stack","Which frontend stack does this project use?","Required to generate compatible source files.","choice"));
  } else if(["vue","svelte"].includes(stack)) {
    blockers.push(`${stack} project detected; v0.9 Accurate compiler currently emits HTML, React, or Next.js patches.`);
    questions.push(question("stack","Choose a supported output or provide a React/Next target.","Current deterministic patch generator does not claim exact Vue/Svelte integration.","choice"));
  }
  if(mode==="existing" && !pkgInfo.pkg && ["react","next"].includes(stack)){
    blockers.push("package.json was not provided.");
    questions.push(question("packageJson","Upload package.json (and lockfile if available).","Needed to preserve your real dependencies and package manager.","file"));
  }
  if(!content.brand) questions.push(question("brand","Project / product name","Replaces generic Brand placeholders with your real identity."));
  if(!content.heroTitle) questions.push(question("heroTitle","Hero headline","Required to fit typography and line breaks to your real content."));
  if(!content.heroBody) questions.push(question("heroBody","Hero supporting text","Required to validate vertical rhythm and responsive height."));
  if(!content.primaryCta) questions.push(question("primaryCta","Primary action text","Required to size the primary control accurately."));
  if(!nav.length) questions.push(question("navItems","Navigation labels","Required to validate header width and mobile collapse behavior.","list"));
  if(!assets.length && !heroAsset) questions.push(question("assets","Upload relevant logo / hero / UI asset names or set their project paths.","Media dimensions materially affect the design.","file",false));

  const targetExists=files.some(x=>x.path===targetPath);
  const sourceDepth=intelligence.scannedFiles>=8 && (intelligence.components.length>=2 || stack==="html");
  const readiness={
    stack:stack!=="unknown" && !["vue","svelte"].includes(stack),
    structure:mode==="new" || Boolean(pkgInfo.pkg && sourceDepth),
    route:mode==="new" || targetExists || Boolean(targetRoute),
    content:Boolean(content.brand && (content.heroTitle || web.headings.length || intelligence.contentStrings.length>=4)),
    assets:Boolean(assets.length || heroAsset || logoAsset || web.images.length),
    designDocs:Boolean(docs.length),
    website:web.scanned,
    github:Boolean(input.githubEvidence?.schema),
    sourceDepth,
  };
  let score=0;
  score += readiness.stack ? 18 : 0;
  score += readiness.structure ? 22 : 0;
  score += readiness.route ? 12 : 0;
  score += readiness.content ? 18 : 0;
  score += readiness.assets ? 8 : 0;
  score += readiness.designDocs ? 5 : 0;
  score += readiness.website ? 7 : 0;
  score += readiness.github ? 5 : 0;
  score += readiness.sourceDepth ? 5 : 0;
  score=Math.min(100,score);
  if(mode==="existing"&&!targetExists){
    questions.push(question("targetPath","Confirm the exact target source file.","The requested route is not present in the supplied source, so replacing it without confirmation is unsafe.","text"));
  }
  if(mode==="existing"&&!sourceDepth){
    blockers.push("Source-code evidence is too shallow for an Accurate existing-project rewrite.");
  }

  const supportedOutput=stack==="next"?"next":stack==="react"?"react":stack==="html"?"html":"html";
  const packageManager=detectedPackageManager==="none" && mode==="new" && ["react","next"].includes(supportedOutput) ? "pnpm" : detectedPackageManager;
  return {
    schema:"kk-project-fit/v1",
    mode,
    projectName,
    description:text(input.description).slice(0,1000),
    stack,
    supportedOutput,
    packageManager,
    packageRoot,
    packageJsonPath:pkgInfo.file,
    packageJson:pkgInfo.pkg ? {
      name:pkgInfo.pkg.name||null,
      scripts:pkgInfo.pkg.scripts||{},
      dependencies:Object.keys(pkgInfo.pkg.dependencies||{}).sort(),
      devDependencies:Object.keys(pkgInfo.pkg.devDependencies||{}).sort(),
    } : null,
    isTypeScript,
    styling,
    routes,
    targetRoute,
    targetPath,
    sources:{
      localFiles:Number(input.sourceSummary?.localFiles||0),
      github:input.githubEvidence?.repository||null,
      website:web.scanned?{url:web.url,title:web.title}:null,
    },
    sourceIntelligence:intelligence,
    websiteContent:web,
    files:{
      count:files.length,
      textFiles:files.filter(x=>TEXT_EXTENSIONS.has(ext(x.path))).map(x=>x.path).slice(0,120),
      sourceFiles:sources,
      designDocs:docs,
      assets,
    },
    content,
    assetMap:{heroAsset,logoAsset},
    readiness:{
      score,...readiness,blockers,questions,
      accurateReady:blockers.length===0 && readiness.stack && readiness.structure && readiness.route && readiness.content &&
        (mode==="new" ? score>=65 : (score>=85 && readiness.sourceDepth))
    },
    requirements:{
      node:["react","next"].includes(supportedOutput) ? "Node.js 22+" : "Modern browser",
      packageManager,
      windows:"Windows 10/11 + PowerShell 7 recommended",
      mac:"macOS 12+ + zsh/bash",
    },
  };
}

function shellQuote(value){ return "'"+String(value).replaceAll("'","'\\''")+"'"; }
function psQuote(value){ return "'"+String(value).replaceAll("'","''")+"'"; }

export function integrationSupportFiles(profile, patchFiles=[]){
  if(profile.mode!=="existing") return [];
  const fileList=patchFiles.map(x=>x.path).filter(Boolean);
  const manifest={
    schema:"kk-project-patch/v1",
    projectName:profile.projectName,
    detectedStack:profile.stack,
    packageManager:profile.packageManager,
    packageRoot:profile.packageRoot||"",
    targetRoute:profile.targetRoute,
    targetPath:profile.targetPath,
    files:fileList,
  };
  const windows=`param([string]$ProjectRoot=(Get-Location).Path)
$ErrorActionPreference="Stop"
$PatchRoot=Join-Path $PSScriptRoot "project-patch"
$BackupRoot=Join-Path $ProjectRoot (".kk-frontend-backup\\" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
$Files=@(${fileList.map(x=>psQuote(x)).join(",")})
foreach($Rel in $Files){
  $Src=Join-Path $PatchRoot $Rel
  $Dst=Join-Path $ProjectRoot $Rel
  if(Test-Path -LiteralPath $Dst){
    $Backup=Join-Path $BackupRoot $Rel
    $BackupParent=Split-Path -Parent $Backup
    if($BackupParent){New-Item -ItemType Directory -Force -Path $BackupParent | Out-Null}
    Copy-Item -LiteralPath $Dst -Destination $Backup -Force
  }
  $DstParent=Split-Path -Parent $Dst
  if($DstParent){New-Item -ItemType Directory -Force -Path $DstParent | Out-Null}
  Copy-Item -LiteralPath $Src -Destination $Dst -Force
}
Write-Host "Design patch applied. Backup: $BackupRoot" -ForegroundColor Green
${profile.packageManager!=="none" ? `$PackageRoot=Join-Path $ProjectRoot ${psQuote(profile.packageRoot||".")}
if(Test-Path -LiteralPath (Join-Path $PackageRoot "package.json")){
  Push-Location $PackageRoot
  try { & ${profile.packageManager} install; if($LASTEXITCODE -ne 0){throw "Dependency install failed"} } finally { Pop-Location }
}` : ""}
`;
  const mac=`#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="\${1:-$PWD}"
PATCH_ROOT="$(cd "$(dirname "$0")" && pwd)/project-patch"
BACKUP_ROOT="$PROJECT_ROOT/.kk-frontend-backup/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_ROOT"
${fileList.map(rel=>`REL=${shellQuote(rel)}
SRC="$PATCH_ROOT/$REL"
DST="$PROJECT_ROOT/$REL"
if [ -f "$DST" ]; then mkdir -p "$BACKUP_ROOT/$(dirname "$REL")"; cp "$DST" "$BACKUP_ROOT/$REL"; fi
mkdir -p "$(dirname "$DST")"
cp "$SRC" "$DST"`).join("\n")}
echo "Design patch applied. Backup: $BACKUP_ROOT"
${profile.packageManager!=="none" ? `PACKAGE_ROOT="$PROJECT_ROOT/${profile.packageRoot||"."}"
if [ -f "$PACKAGE_ROOT/package.json" ]; then cd "$PACKAGE_ROOT"; ${profile.packageManager} install; fi` : ""}
`;
  const instructions=[
    "# KK-FRONTEND Project Integration",
    "",
    `Detected stack: ${profile.stack}`,
    `Package manager: ${profile.packageManager}`,
    `Package root: ${profile.packageRoot||"."}`,
    `Target route: ${profile.targetRoute}`,
    `Primary target file: ${profile.targetPath}`,
    "",
    "## Windows",
    "1. Extract this ZIP outside your project.",
    "2. Open PowerShell 7 in the extracted folder.",
    "3. Run APPLY-WINDOWS.ps1 with -ProjectRoot pointing to your project.",
    "4. The script backs up every replaced file before copying.",
    "",
    "## macOS",
    "1. Extract this ZIP outside your project.",
    "2. Open Terminal in the extracted folder.",
    "3. Run: chmod +x APPLY-MAC.command && ./APPLY-MAC.command /path/to/your-project",
    "4. The script backs up every replaced file before copying.",
    "",
    "Review the live page and run your project's normal tests before committing.",
  ].join("\n");
  return [
    {path:"PROJECT-FIT.json",content:JSON.stringify(profile,null,2)},
    {path:"PATCH-MANIFEST.json",content:JSON.stringify(manifest,null,2)},
    {path:"APPLY-WINDOWS.ps1",content:windows},
    {path:"APPLY-MAC.command",content:mac},
    {path:"INTEGRATION.md",content:instructions},
  ];
}

export function newProjectSupportFiles(profile){
  if(profile?.mode!=="new") return [];
  if(profile.supportedOutput==="html"){
    const windows=[
      '$ErrorActionPreference="Stop"',
      '$Index=Join-Path $PSScriptRoot "index.html"',
      'if(-not (Test-Path -LiteralPath $Index)){throw "index.html not found"}',
      'Start-Process $Index',
    ].join("\n");
    const mac=[
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'cd "$(dirname "$0")"',
      '[ -f index.html ] || { echo "index.html not found"; exit 1; }',
      'open index.html',
    ].join("\n");
    const run=[
      '# Run the generated frontend',
      '',
      'Stack: HTML/CSS/JS',
      '',
      '## PC requirements',
      '- Windows 10/11: a modern browser. PowerShell is included with Windows; PowerShell 7 is recommended.',
      '- macOS 12+: a modern browser and Terminal.',
      '',
      '## Windows',
      'Run: pwsh -File .\\START-WINDOWS.ps1',
      '',
      '## macOS',
      'Run: chmod +x START-MAC.command && ./START-MAC.command',
    ].join("\n");
    return [
      {path:"PROJECT-FIT.json",content:JSON.stringify(profile,null,2)},
      {path:"START-WINDOWS.ps1",content:windows},
      {path:"START-MAC.command",content:mac},
      {path:"RUN.md",content:run},
    ];
  }
  const pm=profile.packageManager==="none" ? "pnpm" : profile.packageManager;
  const windows=[
    '$ErrorActionPreference="Stop"',
    'if(-not (Get-Command node -ErrorAction SilentlyContinue)){throw "Node.js 22+ is required."}',
    '$Major=[int]((node --version).TrimStart("v").Split(".")[0])',
    'if($Major -lt 22){throw "Node.js 22+ is required."}',
    'if(-not (Get-Command '+pm+' -ErrorAction SilentlyContinue)){throw "'+pm+' is required."}',
    'Push-Location $PSScriptRoot',
    'try { & '+pm+' install; if($LASTEXITCODE -ne 0){throw "Dependency install failed"} } finally { Pop-Location }',
    'Write-Host "Setup complete. Read RUN.md." -ForegroundColor Green',
  ].join("\n");
  const mac=[
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'command -v node >/dev/null || { echo "Node.js 22+ is required."; exit 1; }',
    'MAJOR="$(node --version | sed "s/^v//" | cut -d. -f1)"',
    '[ "$MAJOR" -ge 22 ] || { echo "Node.js 22+ is required."; exit 1; }',
    'command -v '+pm+' >/dev/null || { echo "'+pm+' is required."; exit 1; }',
    'cd "$(dirname "$0")"',
    pm+' install',
    'echo "Setup complete. Read RUN.md."',
  ].join("\n");
  const run=[
    '# Run the generated frontend',
    '',
    'Stack: '+profile.supportedOutput,
    'Package manager: '+pm,
    '',
    '## PC requirements',
    '- Windows 10/11: Node.js 22+ and PowerShell 7 recommended.',
    '- macOS 12+: Node.js 22+ and Terminal (zsh/bash).',
    '',
    '## Windows',
    'Run SETUP-WINDOWS.ps1 from PowerShell 7.',
    '',
    '## macOS',
    'Run: chmod +x SETUP-MAC.command && ./SETUP-MAC.command',
    '',
    'Then run '+pm+' run dev when package.json provides a dev script.',
  ].join("\n");
  return [
    {path:"PROJECT-FIT.json",content:JSON.stringify(profile,null,2)},
    {path:"SETUP-WINDOWS.ps1",content:windows},
    {path:"SETUP-MAC.command",content:mac},
    {path:"RUN.md",content:run},
  ];
}
