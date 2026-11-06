import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const project = fileURLToPath(new URL("../", import.meta.url));
const compiled = mkdtempSync(path.join(tmpdir(), "pigweigh-pilot-archive-"));
const require = createRequire(import.meta.url);
process.env.NODE_PATH = path.join(project, "node_modules");
Module._initPaths();
try {
  execFileSync(process.execPath, [path.join(project, "node_modules/typescript/bin/tsc"), "lib/pilot-archive.ts", "lib/pilot-record.ts", "lib/api.ts", "lib/format.ts", "--outDir", compiled, "--target", "es2020", "--module", "commonjs", "--moduleResolution", "node", "--strict", "--skipLibCheck"], { cwd: project, stdio: "pipe" });
} catch (error) { rmSync(compiled, { recursive: true, force: true }); throw error; }
after(() => rmSync(compiled, { recursive: true, force: true }));
const { BlobReader, BlobWriter, Uint8ArrayReader, ZipReader, ZipWriter } = require("@zip.js/zip.js");
const { imageSize } = require("image-size");
const { orientation } = require("exifr");
const { copyPilotArchive, createPilotArchive, openPilotArchive, inspectPilotPhotos, pilotArchiveFilename, pilotPhotoFilename, MAX_PILOT_ARCHIVE_BYTES } = require(path.join(compiled, "pilot-archive.js"));
const { isPilotRecord, TOP_LANDMARKS, SIDE_LANDMARKS, TOP_ANCHORS, SIDE_ANCHORS, pilotMeasuredSegments } = require(path.join(compiled, "pilot-record.js"));

// Node has no browser bitmap decoder; this stub exercises the orientation/dimension contract.
// Browser decoding itself must be verified in Chrome.
globalThis.createImageBitmap = async (blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const size = imageSize(bytes);
  let exif = bytes;
  if (size.type === "webp") {
    const index = Buffer.from(bytes).indexOf("EXIF");
    exif = index < 0 ? new Uint8Array() : bytes.subarray(index + 8);
  }
  const value = await orientation(exif).catch(() => undefined);
  return { width: value >= 5 ? size.height : size.width, height: value >= 5 ? size.width : size.height, close() {} };
};
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i=0;i<8;i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const type = Buffer.from(name);
  const body = Buffer.concat([type, data]);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function png(width = 100, height = 80, exifOrientation = null) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width,0); ihdr.writeUInt32BE(height,4); ihdr[8]=8; ihdr[9]=6;
  const rows = Buffer.alloc((width*4+1)*height, 255);
  for (let y=0;y<height;y++) rows[y*(width*4+1)]=0;
  const chunks = [chunk("IHDR",ihdr)];
  if (exifOrientation !== null) {
    const tiff = Buffer.alloc(26); tiff.write("II",0); tiff.writeUInt16LE(42,2); tiff.writeUInt32LE(8,4); tiff.writeUInt16LE(1,8); tiff.writeUInt16LE(0x112,10); tiff.writeUInt16LE(3,12); tiff.writeUInt32LE(1,14); tiff.writeUInt16LE(exifOrientation,18); tiff.writeUInt32LE(0,22);
    chunks.push(chunk("eXIf",tiff));
  }
  chunks.push(chunk("IDAT",deflateSync(rows)),chunk("IEND",Buffer.alloc(0)));
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),...chunks]);
}
function pair() {
  return { top: new File([png()], "top-original.png", { type: "image/png" }), side: new File([png()], "side-original.png", { type: "image/png" }) };
}
const estimate = {
  status: "estimated", estimated_weight_kg: "90.25", valuation: null, valuation_unavailable_reason: "no_price",
  artifacts: {bundle_id:"fixture-bundle"}, measurements: {body_length_cm:"100.00",chest_width_cm:"30.00",chest_depth_cm:"36.00",girth_cm:"103.89"},
  method:{version:"attached-marker-ellipse-14451-v1",formula:"G_cm^2 * L_cm / 14451",marker_dictionary:"DICT_4X4_50",marker_id:0,marker_side_mm:"100",experimental:true,accuracy_evaluated:false},
};
async function automatic(photos) {
  const info = await inspectPilotPhotos(photos);
  return { estimate, provenance: {version:1,source:"automatic",bundleId:estimate.artifacts.bundle_id,methodVersion:estimate.method.version,imageSha256:{top:info.top.sha256,side:info.side.sha256},landmarks:null,overrides:{top:{},side:{}}},diagnostics:null };
}
function landmarkMap(names, anchors) {
  return Object.fromEntries(names.map((name,index) => {
    const detected = [10+index*2,15+index];
    return [name,{detected,used:anchors.includes(name)?[...detected]:null,confidence:0.8,withinImage:true}];
  }));
}
async function adjusted(photos) {
  const info = await inspectPilotPhotos(photos);
  const top = landmarkMap(TOP_LANDMARKS,TOP_ANCHORS), side=landmarkMap(SIDE_LANDMARKS,SIDE_ANCHORS);
  top["snout-tip"] = {detected:[110,15],used:null,confidence:0.1,withinImage:false};
  top["left-chest"].used=[30,26];
  const overrides={top:{"left-chest":[30,26]},side:{}};
  const points={top:Object.fromEntries(TOP_ANCHORS.map((name)=>[name,top[name].used])),side:Object.fromEntries(SIDE_ANCHORS.map((name)=>[name,side[name].used]))};
  const h=[1,0,0,0,1,0,0.004,0,1];
  const segments=pilotMeasuredSegments(points,h);
  return { estimate,provenance:{version:1,source:"manually_adjusted",bundleId:estimate.artifacts.bundle_id,methodVersion:estimate.method.version,imageSha256:{top:info.top.sha256,side:info.side.sha256},landmarks:{top,side},overrides},
    diagnostics:{version:1,coordinateSpace:"exif-oriented-pixels",top:{width:info.top.width,height:info.top.height,imageSha256:info.top.sha256,imageToMarker:h,segments:segments.top},side:{width:info.side.width,height:info.side.height,imageSha256:info.side.sha256,imageToMarker:[1,0,0,0,1,0,0,0,1],segments:segments.side}}};
}
async function zip(entries) {
  const writer = new ZipWriter(new BlobWriter("application/zip"),{useWebWorkers:false,level:0});
  for (const [name,bytes] of entries) await writer.add(name,new Uint8ArrayReader(typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes));
  return writer.close();
}
async function entriesOf(blob) {
  const reader=new ZipReader(new BlobReader(blob),{useWebWorkers:false});
  const entries=await reader.getEntries();
  const output=[];
  for (const entry of entries) output.push([entry.filename,new Uint8Array(await entry.arrayBuffer())]);
  await reader.close();
  return output;
}
function named(entries,name) { return entries.find(([key])=>key===name)[1]; }
function mutateManifest(entries, change) {
  const manifest=JSON.parse(new TextDecoder().decode(named(entries,"manifest.json")));
  change(manifest);
  return entries.map(([name,bytes])=>[name,name==="manifest.json"?new TextEncoder().encode(JSON.stringify(manifest)):bytes]);
}
async function mutateName(blob, original, replacement) {
  assert.equal(original.length,replacement.length);
  const bytes=Buffer.from(await blob.arrayBuffer()), search=Buffer.from(original), replacementBytes=Buffer.from(replacement);
  let offset=0, count=0;
  while ((offset=bytes.indexOf(search,offset))!==-1) { replacementBytes.copy(bytes,offset); offset+=search.length; count++; }
  assert.equal(count,2);
  return new Blob([bytes],{type:"application/zip"});
}

test("round-trip preserves original files, a priced or unpriced record and explicit local metadata", async () => {
  const photos=pair();
  const price={id:"7",php_per_kg:"210.50",source_reference:"Pilot source",published_at:"2026-11-03T00:00:00Z"};
  const result=await automatic(photos);
  result.estimate={...estimate,valuation:{amount_php:"18997.63",price}}; delete result.estimate.valuation_unavailable_reason;
  const blob=await createPilotArchive({label:"Pig 14",attempt:"2",scaleWeightKg:"90.125",photos,result});
  const opened=await openPilotArchive(blob);
  assert.equal(opened.record.label,"Pig 14"); assert.equal(opened.record.scaleWeightKg,"90.125");
  assert.deepEqual(opened.record.result,result);
  assert.deepEqual(Buffer.from(await opened.photos.top.arrayBuffer()),Buffer.from(await photos.top.arrayBuffer()));
  const reopened=await openPilotArchive(await copyPilotArchive(opened));
  assert.deepEqual(reopened.record,opened.record);
});

test("photos may be explicitly saved without an estimate, including after failed checks", async () => {
  const photos=pair();
  const opened=await openPilotArchive(await createPilotArchive({label:"",attempt:"",scaleWeightKg:null,photos,result:null}));
  assert.equal(opened.record.result,null);
});

test("EXIF rotation records oriented dimensions while preserving exact original bytes", async () => {
  const bytes=png(100,80,6), photos={top:new File([bytes],"rotation.png",{type:"image/png"}),side:pair().side};
  const opened=await openPilotArchive(await createPilotArchive({label:"",attempt:"",scaleWeightKg:null,photos,result:null}));
  assert.equal(opened.record.photos.top.width,80); assert.equal(opened.record.photos.top.height,100);
  assert.deepEqual(Buffer.from(await opened.photos.top.arrayBuffer()),bytes);
});

test("manual archive retains all detections, used points, exact overrides and perspective-correct lines", async () => {
  const photos=pair(), result=await adjusted(photos);
  const opened=await openPilotArchive(await createPilotArchive({label:"edited",attempt:"1",scaleWeightKg:null,photos,result}));
  assert.deepEqual(opened.record.result,result);
  const line=result.diagnostics.top.segments.bodyLength;
  const ears=[result.provenance.landmarks.top["left-ear-base"].used,result.provenance.landmarks.top["right-ear-base"].used];
  assert.notEqual(line[0][0],(ears[0][0]+ears[1][0])/2);
  assert.equal(opened.record.result.provenance.landmarks.top["snout-tip"].withinImage,false);
});

test("rejects malformed or misbound result provenance and diagnostics", async () => {
  const photos=pair(), result=await adjusted(photos);
  const blob=await createPilotArchive({label:"edited",attempt:"1",scaleWeightKg:null,photos,result});
  const entries=await entriesOf(blob);
  const mutations=[
    (m)=>{m.schemaVersion=2}, (m)=>{m.result.provenance.source="automatic"},
    (m)=>{m.result.provenance.bundleId="other"}, (m)=>{m.result.provenance.imageSha256.top="0".repeat(64)},
    (m)=>{delete m.result.provenance.landmarks.top["left-ear-base"]},
    (m)=>{m.result.provenance.landmarks.top["snout-tip"].confidence=1.5},
    (m)=>{m.result.provenance.overrides.top.eye=[1,1]},
    (m)=>{m.result.diagnostics.top.imageToMarker=[1,0,0,0,0,0,0,0,1]},
    (m)=>{m.result.diagnostics.top.segments.bodyLength[0]=[999,999]},
    (m)=>{m.result.diagnostics.top.segments.bodyLength[0]=[15,15]},
    (m)=>{m.result.diagnostics=null},
    (m)=>{m.result.estimate.method.formula="G_cm^2 * L_cm / 11900"},
    (m)=>{m.result.estimate.extra="unknown"},
    (m)=>{m.photos.top.width=5001;m.photos.top.height=5000},
  ];
  for (const mutate of mutations) {
    const changed=mutateManifest(entries,mutate);
    assert.equal(isPilotRecord(JSON.parse(new TextDecoder().decode(named(changed,"manifest.json")))),false);
    await assert.rejects(openPilotArchive(await zip(changed)));
  }
});

test("rejects changed photo bytes, malformed metadata, unknown files, traversal and duplicate names", async () => {
  const photos=pair(), blob=await createPilotArchive({label:"",attempt:"",scaleWeightKg:null,photos,result:await automatic(photos)});
  const entries=await entriesOf(blob);
  await assert.rejects(openPilotArchive(await zip(entries.map(([name,bytes])=>[name,name==="photos/top.png"?png(90,80):bytes]))));
  await assert.rejects(openPilotArchive(await zip(entries.map(([name,bytes])=>[name,name==="manifest.json"?"{broken":bytes]))));
  await assert.rejects(openPilotArchive(await zip([...entries,["extra",new Uint8Array([1])]])));
  const safe=await zip([["aaaa",new Uint8Array([1])],["bbbb",new Uint8Array([1])],["cccc",new Uint8Array([1])]]);
  await assert.rejects(openPilotArchive(await mutateName(safe,"aaaa","../x")));
  await assert.rejects(openPilotArchive(await mutateName(safe,"aaaa","/bad")));
  const dup=await zip([["aaaa",new Uint8Array([1])],["bbbb",new Uint8Array([1])],["cccc",new Uint8Array([1])]]);
  await assert.rejects(openPilotArchive(await mutateName(dup,"bbbb","aaaa")));
});

test("enforces compressed and uncompressed sizes and rejects animated or unsupported photos", async () => {
  await assert.rejects(openPilotArchive(new Blob([new Uint8Array(MAX_PILOT_ARCHIVE_BYTES+1)])),/21 MiB/);
  await assert.rejects(openPilotArchive(await zip([["manifest.json",new Uint8Array(256*1024+1)],["photos/top.png",png()],["photos/side.png",png()]])));
  const photos=pair();
  await assert.rejects(createPilotArchive({label:"",attempt:"",scaleWeightKg:null,photos:{...photos,top:new File([new Uint8Array(10*1024*1024+1)],"large.png",{type:"image/png"})},result:null}),/10 MiB/);
  await assert.rejects(createPilotArchive({label:"",attempt:"",scaleWeightKg:null,photos:{...photos,top:new File(["not an image"],"bad.png",{type:"image/png"})},result:null}));
  const bytes=png(), animated=Buffer.concat([bytes.subarray(0,33),chunk("acTL",Buffer.alloc(8)),bytes.subarray(33)]);
  await assert.rejects(createPilotArchive({label:"",attempt:"",scaleWeightKg:null,photos:{...photos,top:new File([animated],"animated.png",{type:"image/png"})},result:null}),/single still/);
});


test("JPEG and WebP stills with EXIF orientation preserve bytes and match oriented dimensions", async () => {
  const fixtures = [
    ["image/jpeg", "/9j/4AAQSkZJRgABAQAAAQABAAD/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAYAAAAAAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAFAAcDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwChRRRXObH/2Q=="],
    ["image/webp", "UklGRmIAAABXRUJQVlA4WAoAAAAIAAAABgAABAAAVlA4ICIAAABwAQCdASoHAAUAAUAmJYwCdAGIQAD+54v6qp6/Gvse1wAARVhJRhoAAABNTQAqAAAACAABARIAAwAAAAEABgAAAAAAAA=="],
  ];
  for (const [type, base64] of fixtures) {
    const bytes=Buffer.from(base64,"base64"), photos={top:new File([bytes],"photo",{type}),side:pair().side};
    const info=await inspectPilotPhotos(photos);
    assert.equal(info.top.width,5); assert.equal(info.top.height,7);
    const opened=await openPilotArchive(await createPilotArchive({label:"",attempt:"",scaleWeightKg:null,photos,result:null}));
    assert.deepEqual(Buffer.from(await opened.photos.top.arrayBuffer()),bytes);
  }
});


test("individual photo and ZIP filenames are deterministic and contain no paths", () => {
  assert.equal(pilotPhotoFilename("Pig 14", "A/2", "top", "image/jpeg"), "Pig-14-A-2-top.jpg");
  assert.equal(pilotPhotoFilename("Pig 14", "A/2", "side", "image/png"), "Pig-14-A-2-side.png");
  assert.equal(pilotArchiveFilename("../../", ""), "pigweigh-pilot.zip");
  assert.equal(pilotPhotoFilename("", "", "side", "image/webp"), "pigweigh-pilot-side.webp");
});


async function alterEntry(blob, name, change) {
  const bytes=Buffer.from(await blob.arrayBuffer());
  const locate=(signature,nameLengthOffset,nameOffset) => {
    let index=-1;
    while ((index=bytes.indexOf(signature,index+1))!==-1) {
      const length=bytes.readUInt16LE(index+nameLengthOffset);
      if (bytes.subarray(index+nameOffset,index+nameOffset+length).toString()===name) return index;
    }
    throw new Error(`Entry ${name} missing`);
  };
  const local=locate(Buffer.from([0x50,0x4b,0x03,0x04]),26,30);
  const central=locate(Buffer.from([0x50,0x4b,0x01,0x02]),28,46);
  change(bytes,local,central);
  return new Blob([bytes],{type:"application/zip"});
}

test("rejects corrupted CRC, encrypted/unsupported methods, and deceptive entry sizes", async () => {
  const photos=pair(), blob=await createPilotArchive({label:"",attempt:"",scaleWeightKg:null,photos,result:null});
  const crc=await alterEntry(blob,"photos/top.png",(b,local)=>{
    const data=local+30+b.readUInt16LE(local+26)+b.readUInt16LE(local+28);
    b[data+20]^=1;
  });
  await assert.rejects(openPilotArchive(crc));
  const method=await alterEntry(blob,"photos/top.png",(b,local,central)=>{b.writeUInt16LE(99,local+8);b.writeUInt16LE(99,central+10)});
  await assert.rejects(openPilotArchive(method));
  const encrypted=await alterEntry(blob,"photos/top.png",(b,local,central)=>{b.writeUInt16LE(b.readUInt16LE(local+6)|1,local+6);b.writeUInt16LE(b.readUInt16LE(central+8)|1,central+8)});
  await assert.rejects(openPilotArchive(encrypted));
  const size=await alterEntry(blob,"photos/top.png",(b,local,central)=>{b.writeUInt32LE(1,local+22);b.writeUInt32LE(1,central+24)});
  await assert.rejects(openPilotArchive(size));
});

test("rejects declared 20 megapixel overflow before decoding", async () => {
  const bytes=png();bytes.writeUInt32BE(5001,16);bytes.writeUInt32BE(5000,20);
  const photos={top:new File([bytes],"huge.png",{type:"image/png"}),side:pair().side};
  await assert.rejects(createPilotArchive({label:"",attempt:"",scaleWeightKg:null,photos,result:null}),/20 megapixels/);
});
