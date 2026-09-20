import test from "node:test";
import assert from "node:assert/strict";
import {
  createTransportTicket,
  inputChunkKey,
  outputZipKey,
  presignR2Url,
  r2TransportStatus,
  verifyTransportTicket,
} from "../src/storage/r2-transport.mjs";

function withFakeR2(fn){
  const keys=["KK_FRONTEND_R2_ACCOUNT_ID","KK_FRONTEND_R2_ACCESS_KEY_ID","KK_FRONTEND_R2_SECRET_ACCESS_KEY","KK_FRONTEND_R2_BUCKET"];
  const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  process.env.KK_FRONTEND_R2_ACCOUNT_ID="0123456789abcdef0123456789abcdef";
  process.env.KK_FRONTEND_R2_ACCESS_KEY_ID="TESTACCESS123";
  process.env.KK_FRONTEND_R2_SECRET_ACCESS_KEY="test-secret-never-expose";
  process.env.KK_FRONTEND_R2_BUCKET="kk-frontend-large-builds";
  try{return fn();}finally{
    for(const key of keys){
      if(before[key]===undefined)delete process.env[key];
      else process.env[key]=before[key];
    }
  }
}

test("R2 overflow transport reports ready only with all four private server credentials",()=>{
  withFakeR2(()=>{
    const status=r2TransportStatus();
    assert.equal(status.ready,true);
    assert.equal(status.provider,"cloudflare-r2");
    assert.equal(status.maxObjectBytes,50_000_000);
  });
});

test("R2 presigned URLs are deterministic, scoped and never expose the secret",()=>{
  withFakeR2(()=>{
    const key="kk-frontend/tmp/input/12345678-1234-1234-1234-123456789abc/000.part";
    const url=presignR2Url({
      method:"PUT",
      key,
      expiresSeconds:600,
      contentType:"application/octet-stream",
      now:new Date("2026-09-20T12:00:00.000Z"),
    });
    const parsed=new URL(url);
    assert.equal(parsed.hostname,"0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com");
    assert.match(parsed.pathname,/kk-frontend-large-builds\/kk-frontend\/tmp\/input/);
    assert.equal(parsed.searchParams.get("X-Amz-Algorithm"),"AWS4-HMAC-SHA256");
    assert.equal(parsed.searchParams.get("X-Amz-Date"),"20260920T120000Z");
    assert.equal(parsed.searchParams.get("X-Amz-Expires"),"600");
    assert.equal(parsed.searchParams.get("X-Amz-Content-Sha256"),"UNSIGNED-PAYLOAD");
    assert.equal(parsed.searchParams.get("X-Amz-SignedHeaders"),"content-type;host");
    assert.match(parsed.searchParams.get("X-Amz-Signature")||"",/^[a-f0-9]{64}$/);
    assert.equal(url.includes("test-secret-never-expose"),false);
  });
});

test("R2 large-build tickets expire and chunk keys stay in the temporary namespace",()=>{
  withFakeR2(()=>{
    const session="12345678-1234-1234-1234-123456789abc";
    const {ticket}=createTransportTicket(session,{ttlSeconds:600,now:1_000_000});
    assert.equal(verifyTransportTicket(session,ticket,{now:1_100_000}),true);
    assert.equal(verifyTransportTicket(session,ticket,{now:1_700_000}),false);
    assert.equal(inputChunkKey(session,2),"kk-frontend/tmp/input/12345678-1234-1234-1234-123456789abc/002.part");
    assert.match(outputZipKey(),/^kk-frontend\/tmp\/output\/[0-9a-f-]{36}\/project\.zip$/i);
  });
});
