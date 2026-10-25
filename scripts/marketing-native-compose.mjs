import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checkedPath, safePath, loadSharp, sha256, root } from './marketing-lib.mjs';

const plan = JSON.parse(await readFile(checkedPath('marketing/app-store/native-plan.json'), 'utf8'));
const sizes = { 'iphone-1179': [1179,2556], 'iphone-1206': [1206,2622], 'duo-outer': [1398,2034], 'duo-inner': [2007,2853] };
const methods = ['xcrun-simctl-io-screenshot', 'xcode-device-screenshot', 'physical-ios-device-screenshot'];
const requireValue = (value, label) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 250 || /REPLACE|placeholder|pending|unknown/i.test(value)) throw new Error(`Missing genuine provenance: ${label}`);
};
function validateRecord(record, metadata) {
  if (!record || typeof record !== 'object') throw new Error('Capture record required');
  assert.equal(record.platform,'ios-native','Only ios-native captures accepted');
  assert.ok(Object.hasOwn(sizes,record.family),'Unknown native family');
  assert.ok(plan.locales.includes(record.locale),'Unsupported locale');
  assert.ok(plan.screens.some(s => s.id === record.screen),'Unknown screen');
  const expected = `marketing/app-store/native/raw/${record.locale}/${record.family}/${record.screen}.png`;
  assert.equal(record.sourcePath,expected,'Capture must use the exact native raw path; web capture paths are forbidden');
  checkedPath(record.sourcePath);
  assert.match(record.sourceHash,/^[a-f0-9]{64}$/,'Real source SHA-256 required');
  assert.match(record.commit,/^[a-f0-9]{40,64}$/,'Real capture commit required');
  for (const key of ['device','osVersion','build','sourceScreen']) requireValue(record[key],key);
  assert.ok(methods.includes(record.captureMethod),'Unsupported native capture method');
  assert.ok(typeof record.capturedAt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(record.capturedAt) && Number.isFinite(Date.parse(record.capturedAt)),'Capture timestamp required');
  for (const flag of ['demoDataOnly','productionWritesDisabled','reviewedNoOverlays']) assert.equal(record[flag],true,`${flag} attestation required`);
  if (metadata) {
    assert.equal(metadata.format,'png','Native raw must be PNG');
    assert.deepEqual([metadata.width,metadata.height],sizes[record.family],'Raw dimensions do not match selected native family; stretching is forbidden');
  }
}
function validatePlan() {
  assert.equal(plan.schemaVersion,1); assert.equal(plan.platform,'ios-native');
  assert.deepEqual(plan.locales,['en','de']);
  assert.deepEqual(Object.keys(plan.families),Object.keys(sizes));
  for (const [id,size] of Object.entries(sizes)) assert.deepEqual([plan.families[id].width,plan.families[id].height],size);
  assert.equal(new Set(plan.screens.map(s=>s.id)).size,10);
  for (const screen of plan.screens) for (const locale of plan.locales) assert.ok(typeof screen.titles[locale] === 'string' && screen.titles[locale].length < 60);
  assert.deepEqual(plan.template,{background:'#0d1311',headingColor:'#ffffff',accent:'#57d6a0',marginRatio:0.075,captureTopRatio:0.24,captureBottomRatio:0.045,captureFit:'contain',fontSize:52});
  // Synthetic metadata exercises guards only. It never produces a synthetic image or final file.
  const valid = {platform:'ios-native',family:'iphone-1179',locale:'en',screen:'passport',sourcePath:'marketing/app-store/native/raw/en/iphone-1179/passport.png',sourceHash:'a'.repeat(64),commit:'b'.repeat(40),device:'iPhone 15',osVersion:'18.0',build:'development-123',sourceScreen:'PlayerProfile',captureMethod:methods[0],capturedAt:'2026-10-23T10:00:00Z',demoDataOnly:true,productionWritesDisabled:true,reviewedNoOverlays:true};
  validateRecord(valid,{format:'png',width:1179,height:2556});
  for (const change of [{platform:'web'},{sourcePath:'public/welcome/img/next-era/passport.png'},{sourcePath:'marketing/app-store/native/raw/../web.png'},{sourceHash:''},{device:''},{build:''},{locale:'fr'},{captureMethod:'playwright'},{commit:null},{reviewedNoOverlays:false}]) assert.throws(()=>validateRecord({...valid,...change}));
  assert.throws(()=>validateRecord(valid,{format:'png',width:390,height:844}));
  for (const invalid of ['marketing/../x','marketing/a/../../x','marketing\\x','/tmp/x',null]) assert.throws(()=>checkedPath(invalid));
}

async function main() {
  validatePlan();
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--validate-plan') {
    await safePath('marketing/app-store/native-plan.json');
    console.log('PASS: en/de templates, 4 Apple dimension families, 16 rejection guards, safePath ancestor traversal. No final PNGs written.');
    return;
  }
  if (!args.length) { console.error('PENDING: genuine iOS-native captures required. Use --manifest marketing/app-store/native/captures.json or --validate-plan. No final PNGs written.'); process.exitCode=2; return; }
  if (args.length !== 2 || args[0] !== '--manifest' || !/^marketing\/app-store\/native\/[a-z0-9-]+\.json$/.test(args[1])) throw new Error('Usage: --manifest marketing/app-store/native/NAME.json | --validate-plan');
  const input = JSON.parse(await readFile(await safePath(args[1]),'utf8'));
  assert.equal(input.schemaVersion,1);
  assert.ok(Array.isArray(input.captures) && input.captures.length > 0 && input.captures.length <= 40,'Provide 1-40 real capture records');
  const sharp=loadSharp();
  const validated=[];
  const keys=new Set();
  // Preflight every input before any final export is created.
  for (const record of input.captures) {
    validateRecord(record);
    const file=await safePath(record.sourcePath);
    const buffer=await readFile(file);
    assert.equal(await sha256(file),record.sourceHash,'Raw source hash mismatch');
    const metadata=await sharp(buffer,{limitInputPixels:20000000}).metadata();
    validateRecord(record,metadata);
    const key=`${record.locale}/${record.family}/${record.screen}`;
    assert.ok(!keys.has(key),'Duplicate native capture'); keys.add(key);
    validated.push({record,buffer});
  }
  const results=[];
  for (const {record,buffer} of validated) {
    const [width,height]=sizes[record.family];
    const t=plan.template;
    const margin=Math.round(width*t.marginRatio);
    const top=Math.round(height*t.captureTopRatio);
    const availableHeight=height-top-Math.round(height*t.captureBottomRatio);
    const capture=await sharp(buffer).resize(width-2*margin,availableHeight,{fit:'inside',withoutEnlargement:true}).png().toBuffer();
    const cm=await sharp(capture).metadata();
    const font=path.join(root,'node_modules/@expo-google-fonts/inter/Inter_800ExtraBold.ttf');
    const title=plan.screens.find(s=>s.id===record.screen).titles[record.locale];
    const titleBuffer=await sharp({text:{text:title,font:`Inter ExtraBold ${t.fontSize}`,fontfile:font,width:width-2*margin,rgba:true,dpi:72}}).tint(t.headingColor).png().toBuffer();
    const tm=await sharp(titleBuffer).metadata();
    assert.ok(tm.height<top-margin*1.4,'Headline exceeds template safe area');
    const exportPath=`marketing/app-store/native/final/${record.locale}/${record.family}/${record.screen}.png`;
    const output=await safePath(exportPath);
    await sharp({create:{width,height,channels:3,background:t.background}}).composite([{input:titleBuffer,left:margin,top:margin},{input:capture,left:Math.round((width-cm.width)/2),top}]).flatten({background:t.background}).removeAlpha().png().toFile(output);
    results.push({...record,exportPath,exportHash:await sha256(output),width,height,composition:'native-plan-v1-contain-no-crop',verificationState:'provenance-checked-owner-native-review-required'});
  }
  await writeFile(await safePath('marketing/app-store/native/composed-manifest.json'),JSON.stringify({schemaVersion:1,planHash:await sha256(await safePath('marketing/app-store/native-plan.json')),assets:results,note:'Metadata attestations do not independently prove native authenticity or Apple acceptance.'},null,2)+'\n');
  console.log(`Composed ${results.length} provenance-gated native screenshots. Owner review still required.`);
}
main().catch(error=>{console.error(`Native compose refused: ${error.message}`);process.exitCode=1;});
