import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, mock, test } from "node:test";
import { fileURLToPath } from "node:url";
const project=fileURLToPath(new URL("../",import.meta.url));
const compiled=mkdtempSync(path.join(tmpdir(),"pigweigh-guided-tests-"));
const require=createRequire(import.meta.url);
try { execFileSync(process.execPath,[path.join(project,"node_modules/typescript/bin/tsc"),"lib/guided-capture.ts","--outDir",compiled,"--target","es2020","--module","commonjs","--strict","--skipLibCheck"],{cwd:project,stdio:"pipe"}); }
catch(error) {rmSync(compiled,{recursive:true,force:true});throw error;}
after(()=>rmSync(compiled,{recursive:true,force:true}));
const {runGuidedCapture,GUIDED_MAX_ATTEMPTS,GUIDED_MAX_DURATION_MS}=require(path.join(compiled,"guided-capture.js"));
const {PhotoCheckQueue}=require(path.join(compiled,"photo-checks.js"));
const makePhoto=()=>new File(["synthetic still"],"frame.jpg",{type:"image/jpeg"});
const fail=(kind)=>({status:"failed",kind,message:`${kind} failure`});
function clock() {let time=0;const delays=[];return {now:()=>time,advance:(n)=>{time+=n},delays,wait:async(ms)=>{delays.push(ms);time+=ms}};}

test("rejected stills and busy responses are bounded with the specified backoff", async()=>{
  for (const [kind,expected] of [["rejected",[1200,1200,1200,1200]],["busy",[1000,2000,4000,4000]]]) {
    const timer=clock(), controller=new AbortController();let captures=0,checks=0;
    const result=await runGuidedCapture({view:"top",signal:controller.signal,now:timer.now,wait:timer.wait,capture:async()=>{captures++;return makePhoto()},check:async()=>{checks++;return fail(kind)}});
    assert.equal(result.status,"exhausted");assert.equal(captures,GUIDED_MAX_ATTEMPTS);assert.equal(checks,GUIDED_MAX_ATTEMPTS);assert.deepEqual(timer.delays,expected);
  }
});

test("unavailable, network and other service failures stop immediately",async()=>{
  for(const kind of ["unavailable","connection","service"]) {
    const timer=clock();let checks=0;
    const result=await runGuidedCapture({view:"side",signal:new AbortController().signal,now:timer.now,wait:timer.wait,capture:async()=>makePhoto(),check:async()=>{checks++;return fail(kind)}});
    assert.equal(result.status,"failed");assert.match(result.message,new RegExp(kind));assert.equal(checks,1);assert.deepEqual(timer.delays,[]);
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

test("the wall-clock deadline ends an unresolved candidate without waiting for the request",async()=>{
  mock.timers.enable({apis:["setTimeout"]});
  try {
    let checkCalls=0;
    const pending=runGuidedCapture({view:"top",signal:new AbortController().signal,capture:async()=>makePhoto(),check:()=>{checkCalls++;return new Promise(()=>{})}});
    await Promise.resolve();await Promise.resolve();mock.timers.tick(GUIDED_MAX_DURATION_MS);
    assert.equal((await pending).status,"expired");assert.equal(checkCalls,1);
  } finally { mock.timers.reset(); }
});

test("rejects a mismatched candidate and stops if the elapsed budget is exhausted",async()=>{
  const timer=clock(), photo=makePhoto();
  const mismatch=await runGuidedCapture({view:"top",signal:new AbortController().signal,capture:async()=>photo,check:async()=>({status:"passed",view:"side",file:photo,data:{status:"validated",view:"side",artifacts:{bundle_id:"fixture"}}})});
  assert.equal(mismatch.status,"failed");
  const expired=await runGuidedCapture({view:"top",signal:new AbortController().signal,now:timer.now,wait:timer.wait,capture:async()=>photo,check:async()=>{timer.advance(GUIDED_MAX_DURATION_MS);return fail("rejected")}});
  assert.equal(expired.status,"expired");assert.deepEqual(timer.delays,[]);
});
