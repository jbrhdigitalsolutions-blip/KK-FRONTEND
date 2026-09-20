import crypto from "node:crypto";

const REGION="auto";
const SERVICE="s3";
const PREFIX="kk-frontend/tmp";
const MAX_OBJECT_BYTES=50_000_000;
const DEFAULT_EXPIRES_SECONDS=900;

function env(name){return String(process.env[name]||"").trim();}
function config(){
  return {
    accountId:env("KK_FRONTEND_R2_ACCOUNT_ID"),
    accessKeyId:env("KK_FRONTEND_R2_ACCESS_KEY_ID"),
    secretAccessKey:env("KK_FRONTEND_R2_SECRET_ACCESS_KEY"),
    bucket:env("KK_FRONTEND_R2_BUCKET"),
  };
}
export function r2TransportStatus(){
  const c=config();
  const missing=Object.entries(c).filter(([,value])=>!value).map(([key])=>key);
  return {
    provider:"cloudflare-r2",
    ready:missing.length===0,
    missing,
    maxObjectBytes:MAX_OBJECT_BYTES,
    freeTierNote:"Cloudflare R2 Standard includes 10 GB-month storage, 1M Class A and 10M Class B operations per month; egress is free.",
  };
}
function assertReady(){
  const c=config();
  const missing=Object.entries(c).filter(([,value])=>!value).map(([key])=>key);
  if(missing.length){
    const e=new Error("Large-build overflow transport is not configured. Set KK_FRONTEND_R2_ACCOUNT_ID, KK_FRONTEND_R2_ACCESS_KEY_ID, KK_FRONTEND_R2_SECRET_ACCESS_KEY and KK_FRONTEND_R2_BUCKET.");
    e.code="R2_NOT_CONFIGURED";
    throw e;
  }
  return c;
}
function awsEncode(value){
  return encodeURIComponent(String(value)).replace(/[!'()*]/g,ch=>"%"+ch.charCodeAt(0).toString(16).toUpperCase());
}
function canonicalUri(bucket,key){
  const parts=[bucket,...String(key).split("/")].map(awsEncode);
  return "/"+parts.join("/");
}
function amzTimestamp(now){
  return now.toISOString().replace(/[:-]|\.\d{3}/g,"");
}
function hmac(key,data,encoding){
  return crypto.createHmac("sha256",key).update(data).digest(encoding);
}
function sha256Hex(data){
  return crypto.createHash("sha256").update(data).digest("hex");
}
function signingKey(secret,dateStamp){
  const kDate=hmac(Buffer.from("AWS4"+secret,"utf8"),dateStamp);
  const kRegion=hmac(kDate,REGION);
  const kService=hmac(kRegion,SERVICE);
  return hmac(kService,"aws4_request");
}
function canonicalQuery(entries){
  return entries
    .map(([k,v])=>[awsEncode(k),awsEncode(v)])
    .sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1]))
    .map(([k,v])=>`${k}=${v}`)
    .join("&");
}
function safeHeaderValue(value){return String(value||"").replace(/[\r\n]/g," ").trim();}
function objectKey(kind,id,part=""){
  const safeKind=["input","output"].includes(kind)?kind:"input";
  const suffix=part?"/"+String(part).replace(/[^A-Za-z0-9._-]/g,"_"):"";
  return `${PREFIX}/${safeKind}/${id}${suffix}`;
}
function assertAllowedKey(key,kind=""){
  const normalized=String(key||"");
  const prefix=kind?`${PREFIX}/${kind}/`:`${PREFIX}/`;
  if(!normalized.startsWith(prefix) || normalized.includes("..")){
    throw new Error("R2 object key is outside the KK-FRONTEND temporary namespace.");
  }
  return normalized;
}
export function presignR2Url({method="GET",key,expiresSeconds=DEFAULT_EXPIRES_SECONDS,contentType="",contentDisposition="",now=new Date(),extraQuery={}}={}){
  const c=assertReady();
  const normalizedKey=assertAllowedKey(key);
  const verb=String(method||"GET").toUpperCase();
  if(!["GET","PUT","DELETE","HEAD"].includes(verb))throw new Error("Unsupported R2 presign method.");
  const expires=Math.max(1,Math.min(604800,Number(expiresSeconds)||DEFAULT_EXPIRES_SECONDS));
  const amzDate=amzTimestamp(now);
  const dateStamp=amzDate.slice(0,8);
  const scope=`${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const host=`${c.accountId}.r2.cloudflarestorage.com`;
  const headers=[["host",host]];
  if(contentType)headers.push(["content-type",safeHeaderValue(contentType)]);
  if(contentDisposition)headers.push(["content-disposition",safeHeaderValue(contentDisposition)]);
  headers.sort((a,b)=>a[0].localeCompare(b[0]));
  const canonicalHeaders=headers.map(([k,v])=>`${k}:${v}\n`).join("");
  const signedHeaders=headers.map(([k])=>k).join(";");
  const query=[
    ["X-Amz-Algorithm","AWS4-HMAC-SHA256"],
    ["X-Amz-Content-Sha256","UNSIGNED-PAYLOAD"],
    ["X-Amz-Credential",`${c.accessKeyId}/${scope}`],
    ["X-Amz-Date",amzDate],
    ["X-Amz-Expires",String(expires)],
    ["X-Amz-SignedHeaders",signedHeaders],
    ...Object.entries(extraQuery||{}).map(([k,v])=>[k,String(v)]),
  ];
  const canonicalQs=canonicalQuery(query);
  const uri=canonicalUri(c.bucket,normalizedKey);
  const canonicalRequest=[verb,uri,canonicalQs,canonicalHeaders,signedHeaders,"UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign=["AWS4-HMAC-SHA256",amzDate,scope,sha256Hex(canonicalRequest)].join("\n");
  const signature=hmac(signingKey(c.secretAccessKey,dateStamp),stringToSign,"hex");
  return `https://${host}${uri}?${canonicalQs}&X-Amz-Signature=${signature}`;
}
async function requireOk(response,operation){
  if(response.ok)return response;
  const body=await response.text().catch(()=>"");
  throw new Error(`R2 ${operation} failed (${response.status}): ${body.slice(0,300)||response.statusText}`);
}
export function newTransportSession(){
  return crypto.randomUUID();
}
export function inputChunkKey(sessionId,index){
  if(!/^[0-9a-f-]{36}$/i.test(String(sessionId||"")))throw new Error("Invalid large-build session id.");
  const n=Number(index);
  if(!Number.isInteger(n)||n<0||n>63)throw new Error("Invalid large-build chunk index.");
  return objectKey("input",sessionId,`${String(n).padStart(3,"0")}.part`);
}
export function outputZipKey(){
  return objectKey("output",crypto.randomUUID(),"project.zip");
}
export async function putR2Object(key,body,{contentType="application/octet-stream",contentDisposition=""}={}){
  const bytes=Buffer.isBuffer(body)?body:Buffer.from(body);
  if(bytes.length>MAX_OBJECT_BYTES)throw new Error("R2 temporary object exceeds the 50 MB KK-FRONTEND safety limit.");
  const url=presignR2Url({method:"PUT",key,contentType,contentDisposition});
  const headers={"Content-Type":contentType};
  if(contentDisposition)headers["Content-Disposition"]=contentDisposition;
  const response=await fetch(url,{method:"PUT",headers,body:bytes});
  await requireOk(response,"upload");
  return {key,bytes:bytes.length};
}
export async function getR2Object(key,{maxBytes=MAX_OBJECT_BYTES}={}){
  const normalized=assertAllowedKey(key);
  const url=presignR2Url({method:"GET",key:normalized});
  const response=await requireOk(await fetch(url),"download");
  const declared=Number(response.headers.get("content-length")||0);
  if(declared && declared>maxBytes)throw new Error("R2 temporary object exceeds the allowed read limit.");
  const data=Buffer.from(await response.arrayBuffer());
  if(data.length>maxBytes)throw new Error("R2 temporary object exceeds the allowed read limit.");
  return data;
}
export async function deleteR2Object(key){
  const normalized=assertAllowedKey(key);
  const url=presignR2Url({method:"DELETE",key:normalized});
  const response=await fetch(url,{method:"DELETE"});
  if(response.status===404)return false;
  await requireOk(response,"delete");
  return true;
}
export async function deleteR2Objects(keys=[]){
  await Promise.allSettled(keys.filter(Boolean).map(key=>deleteR2Object(key)));
}
export function createR2Download({key,filename,expiresSeconds=1800}={}){
  assertAllowedKey(key,"output");
  const safeName=String(filename||"kk-frontend-build.zip").replace(/["\r\n]/g,"_");
  const url=presignR2Url({
    method:"GET",
    key,
    expiresSeconds,
    extraQuery:{"response-content-disposition":`attachment; filename="${safeName}"`},
  });
  return {provider:"cloudflare-r2",url,key,expiresSeconds};
}
