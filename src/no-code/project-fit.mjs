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
  const pkgFile=fileBy(files,x=>/(^|\/)package\.json$/i.test(x.path));
  const pkg=parseJson(pkgFile?.text);
  if(!pkg) return {file:null,pkg:null,deps:{}};
  return {
    file:pkgFile.path,
    pkg,
    deps:{...(pkg.dependencies||{}),...(pkg.devDependencies||{})},
  };
}

function detectStack(files,pkgInfo,requested="auto"){
  if(requested && requested!=="auto") return requested;
  const deps=pkgInfo.deps||{};
  const paths=files.map(x=>x.path.toLowerCase());
  if(deps.next || paths.some(x=>/^app\/.+page\.(jsx?|tsx?)$/.test(x) || /^pages\/.+\.(jsx?|tsx?)$/.test(x))) return "next";
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

function detectRoutes(files,stack){
  const paths=files.map(x=>x.path);
  const routes=[];
  if(stack==="next"){
    for(const p of paths){
      let m=p.match(/^app\/(.*)\/page\.(?:js|jsx|ts|tsx)$/);
      if(m) routes.push("/"+m[1].replace(/\([^/]+\)\//g,"").replace(/\[([^\]]+)\]/g,":$1"));
      m=p.match(/^pages\/(.*)\.(?:js|jsx|ts|tsx)$/);
      if(m && !m[1].startsWith("_")) routes.push("/"+m[1].replace(/\/index$/,"").replace(/\[([^\]]+)\]/g,":$1"));
    }
  }
  return unique(routes).slice(0,40);
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

function defaultTargetPath(stack,isTs,route){
  const cleanRoute=String(route||"/").replace(/^\/+|\/+$/g,"");
  if(stack==="next"){
    const base=cleanRoute ? `app/${cleanRoute}/` : "app/";
    return base+`page.${isTs?"tsx":"jsx"}`;
  }
  if(stack==="react") return `src/components/ReferenceDesign.${isTs?"tsx":"jsx"}`;
  return "reference-design.html";
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
  const routes=detectRoutes(files,stack);
  const assets=assetFiles(files);
  const docs=designDocs(files);
  const sources=sourceFiles(files);
  const mode=["existing","new"].includes(input.mode) ? input.mode : (files.length ? "existing" : "new");
  const projectName=text(input.projectName,pkgInfo.pkg?.name || "my-project").slice(0,100);
  const targetRoute=text(input.targetRoute,routes[0] || "/").slice(0,240);
  const targetPath=text(input.targetPath,defaultTargetPath(stack,isTypeScript,targetRoute)).slice(0,300);
  const nav=cleanList(input.navItems);
  const content={
    brand:text(input.brand).slice(0,120),
    heroTitle:text(input.heroTitle).slice(0,240),
    heroBody:text(input.heroBody).slice(0,600),
    primaryCta:text(input.primaryCta).slice(0,100),
    secondaryCta:text(input.secondaryCta).slice(0,100),
    navItems:nav,
    footerText:text(input.footerText).slice(0,300),
  };
  const heroAsset=text(input.heroAsset || publicAssetUrl(bestAsset(assets,["hero","banner","cover","landing"]))).slice(0,500);
  const logoAsset=text(input.logoAsset || publicAssetUrl(bestAsset(assets,["logo","brand","mark"]))).slice(0,500);
  const blockers=[];
  const questions=[];

  if(stack==="unknown") {
    blockers.push("Target frontend stack is unknown.");
    questions.push(question("stack","Which frontend stack does this project use?","Required to generate compatible source files.","choice"));
  } else if(["vue","svelte"].includes(stack)) {
    blockers.push(`${stack} project detected; v0.8 accurate compiler currently emits HTML, React, or Next.js patches.`);
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

  const readiness={
    stack:stack!=="unknown" && !["vue","svelte"].includes(stack),
    structure:mode==="new" || Boolean(pkgInfo.pkg || sources.length),
    content:Boolean(content.brand && content.heroTitle && content.heroBody && content.primaryCta && nav.length),
    assets:Boolean(assets.length || heroAsset || logoAsset),
    designDocs:Boolean(docs.length),
  };
  let score=0;
  score += readiness.stack ? 25 : 0;
  score += readiness.structure ? 20 : 0;
  score += readiness.content ? 30 : 0;
  score += readiness.assets ? 15 : 0;
  score += readiness.designDocs ? 10 : 0;
  score=Math.min(100,score);

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
    files:{
      count:files.length,
      textFiles:files.filter(x=>TEXT_EXTENSIONS.has(ext(x.path))).map(x=>x.path).slice(0,120),
      sourceFiles:sources,
      designDocs:docs,
      assets,
    },
    content,
    assetMap:{heroAsset,logoAsset},
    readiness:{score,...readiness,blockers,questions,accurateReady:blockers.length===0 && score>=75},
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
${profile.packageManager!=="none" ? `if(Test-Path -LiteralPath (Join-Path $ProjectRoot "package.json")){
  Push-Location $ProjectRoot
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
${profile.packageManager!=="none" ? `if [ -f "$PROJECT_ROOT/package.json" ]; then cd "$PROJECT_ROOT"; ${profile.packageManager} install; fi` : ""}
`;
  const instructions=[
    "# KK-FRONTEND Project Integration",
    "",
    `Detected stack: ${profile.stack}`,
    `Package manager: ${profile.packageManager}`,
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
