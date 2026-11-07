import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
const project=fileURLToPath(new URL("../",import.meta.url));
const compiled=mkdtempSync(path.join(tmpdir(),"pigweigh-guided-tests-"));
const require=createRequire(import.meta.url);
try { execFileSync(process.execPath,[path.join(project,"node_modules/typescript/bin/tsc"),"lib/guided-capture.ts","--outDir",compiled,"--target","es2020","--module","commonjs","--strict","--skipLibCheck"],{cwd:project,stdio:"pipe"}); }
catch(error) {rmSync(compiled,{recursive:true,force:true});throw error;}
after(()=>rmSync(compiled,{recursive:true,force:true}));
const {runGuidedCapture}=require(path.join(compiled,"guided-capture.js"));
const {PhotoCheckQueue}=require(path.join(compiled,"photo-checks.js"));
const makePhoto=()=>new File(["synthetic still"],"frame.jpg",{type:"image/jpeg"});
const fail=(kind)=>({status:"failed",kind,message:`${kind} failure`});
test("rejected and busy checks retry at 850 ms beyond the old attempt limit", async()=>{
  for (const kind of ["rejected", "busy"]) {
    const file=makePhoto(), delays=[];
    let checks=0;
    const result=await runGuidedCapture({view:"top",signal:new AbortController().signal,
      capture:async()=>file,wait:async(ms)=>{delays.push(ms)},check:async()=>++checks <= 6
        ? fail(kind) : {status:"passed",view:"top",file,data:{status:"validated",view:"top",artifacts:{bundle_id:"fixture"}}}});
    assert.equal(result.status,"passed");
    assert.deepEqual(delays,[850,850,850,850,850,850]);
  }
});

test("unavailable, network and other service failures stop immediately",async()=>{
  for(const kind of ["unavailable","connection","service"]) {
    const delays=[];let checks=0;
    const result=await runGuidedCapture({view:"side",signal:new AbortController().signal,wait:async(ms)=>{delays.push(ms)},capture:async()=>makePhoto(),check:async()=>{checks++;return fail(kind)}});
    assert.equal(result.status,"failed");assert.match(result.message,new RegExp(kind));assert.equal(checks,1);assert.deepEqual(delays,[]);
  }
});

test("a passing candidate preserves the exact frame, view and successful queue proof",async()=>{
  const controller=new AbortController(),file=makePhoto();let checks=0;
  const queue=new PhotoCheckQueue(async(view,checked)=>{checks++;assert.equal(checked,file);return {status:"validated",view,artifacts:{bundle_id:"fixture"}}});
  const result=await runGuidedCapture({view:"top",signal:controller.signal,capture:async()=>file,check:(candidate,signal)=>queue.checkCandidate("top",candidate,signal)});
  assert.equal(result.status,"passed");assert.equal(result.candidate.file,file);assert.equal(queue.promoteCandidate(result.candidate),true);assert.equal(checks,1);
});

test("stopping invalidates a completed proof before acceptance",async()=>{
  const controller=new AbortController(),file=makePhoto();
  const queue=new PhotoCheckQueue(async(view)=>({status:"validated",view,artifacts:{bundle_id:"fixture"}}));
  const result=await runGuidedCapture({view:"side",signal:controller.signal,capture:async()=>file,check:(candidate,signal)=>queue.checkCandidate("side",candidate,signal)});
  assert.equal(result.status,"passed");controller.abort();assert.equal(queue.promoteCandidate(result.candidate),false);
});

test("stop cancels pending encoding promptly and ignores its late completion",async()=>{
  const controller=new AbortController();let finish,checks=0;
  const pending=runGuidedCapture({view:"top",signal:controller.signal,capture:()=>new Promise((resolve)=>{finish=resolve}),check:async()=>{checks++;return fail("rejected")}});
  controller.abort();assert.equal((await pending).status,"stopped");finish(makePhoto());await new Promise((resolve)=>setImmediate(resolve));assert.equal(checks,0);
});

test("stop cancels an unresolved candidate",async()=>{
  const controller=new AbortController();
  let started;
  const checking=new Promise((resolve)=>{started=resolve});
  const pending=runGuidedCapture({view:"top",signal:controller.signal,
    capture:async()=>makePhoto(),check:()=>{started();return new Promise(()=>{})}});
  await checking;
  controller.abort();
  assert.equal((await pending).status,"stopped");
});

test("rejects a mismatched candidate",async()=>{
  const photo=makePhoto();
  const result=await runGuidedCapture({view:"top",signal:new AbortController().signal,capture:async()=>photo,
    check:async()=>({status:"passed",view:"side",file:photo,data:{status:"validated",view:"side",artifacts:{bundle_id:"fixture"}}})});
  assert.equal(result.status,"failed");
});
