import { copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { root, safePath, checkedPath, loadSharp, sha256, specs } from './marketing-lib.mjs';

const sharp = loadSharp();
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--source')) throw new Error('Usage: node scripts/marketing-compose.mjs [--source ABSOLUTE.png]');
const source = await safePath('marketing/source-assets/generated-football-master.png');
if (args.length) {
  if (!path.isAbsolute(args[1]) || path.extname(args[1]).toLowerCase() !== '.png') throw new Error('Source must be an absolute PNG file');
  const metadata = await sharp(args[1], { limitInputPixels: 100000000 }).metadata();
  if (metadata.format !== 'png' || metadata.width < 1200 || metadata.height < 600) throw new Error('Source is not a sufficiently sized PNG');
  if (path.resolve(args[1]) !== source) await copyFile(args[1], source);
}
await sharp(source).metadata();
const icon = path.join(root, 'assets/icon.png');
await copyFile(icon, await safePath('marketing/brand/pitchproof-icon.png'));
const font = path.join(root, 'node_modules/@expo-google-fonts/inter/Inter_800ExtraBold.ttf');
const regular = path.join(root, 'node_modules/@expo-google-fonts/inter/Inter_400Regular.ttf');
await readFile(font); await readFile(regular);
const textLayer = async (text, size, color, bold = true) => sharp({text:{text:`<span foreground="${color}">${text}</span>`,font:`Inter ${bold ? 'ExtraBold' : ''} ${size}`,fontfile:bold ? font : regular,rgba:true,dpi:72}}).png().toBuffer();
let commit = null;
try { commit = execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(); } catch { /* Source archives may not include Git. */ }
const records = [];
for (const [name,w,h,layout,line1,line2,copy] of specs) {
  const square = layout === 'search';
  const unit = w / 1920;
  const left = Math.round(w * .075);
  const layers = [];
  if (square) {
    const photo = await sharp(source).resize(w,Math.round(h*.64),{fit:'cover',position:'right'}).toBuffer();
    layers.push({input:photo,left:0,top:Math.round(h*.36)});
    layers.push({input:Buffer.from(`<svg width="${w}" height="${h}"><defs><linearGradient id="g" x2="0" y2="1"><stop offset=".3" stop-color="#121210"/><stop offset=".72" stop-color="#121210" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`),left:0,top:0});
  } else {
    layers.push({input:await sharp(source).resize(w,h,{fit:'cover',position:'right'}).toBuffer(),left:0,top:0});
    layers.push({input:Buffer.from(`<svg width="${w}" height="${h}"><defs><linearGradient id="g"><stop stop-color="#10120f" stop-opacity=".97"/><stop offset=".52" stop-color="#10120f" stop-opacity=".82"/><stop offset=".83" stop-color="#10120f" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`),left:0,top:0});
  }
  const logoSize = Math.round(110*unit);
  layers.push({input:await sharp(icon).resize(logoSize,logoSize).toBuffer(),left,top:Math.round(h*.075)});
  const addText = async (text,size,color,x,y,bold=true) => {
    const input = await textLayer(text,Math.round(size*unit),color,bold);
    const m = await sharp(input).metadata();
    if (x+m.width>w-w*.05 || y+m.height>h-h*.04) throw new Error(`Text exceeds safe zone: ${name}: ${text}`);
    layers.push({input,left:Math.round(x),top:Math.round(y)});
  };
  await addText('PitchProof',50,'#ffffff',left+logoSize+22*unit,h*.075+26*unit);
  const y = square ? h*.23 : h*.36;
  const size = square ? 106 : layout==='header' ? 79 : 74;
  await addText(line1,size,'#ffffff',left,y);
  await addText(line2,size,'#57d6a0',left,y+size*unit*1.22);
  await addText(copy,layout==='header' ? 26 : 25,'#ededeb',left,y+size*unit*2.75,false);
  const output = await safePath(`marketing/${name}`);
  let pipeline = sharp({create:{width:w,height:h,channels:3,background:'#0d1311'}}).composite(layers).flatten({background:'#0d1311'}).removeAlpha().toColourspace('srgb');
  pipeline = name.endsWith('.webp') ? pipeline.webp({quality:86}) : pipeline.png({compressionLevel:9});
  await pipeline.toFile(output);
  records.push({placement:layout,deviceClass:'campaign-artwork',language:'en',width:w,height:h,sourceScreen:null,captureBuild:null,captureCommit:null,compositionCommit:commit,captureMethod:'none-generated-illustration',exportPath:`marketing/${name}`,sha256:await sha256(output),verificationState:'exported-awaiting-owner-review',nativeScreenshot:false});
}
const data = {schemaVersion:1,source:{path:'marketing/source-assets/generated-football-master.png',sha256:await sha256(source),...await sharp(source).metadata(),provenance:'User-supplied original generated illustration; not a real player photograph or app capture.',rights:'Generated source supplied for this campaign. No third-party photography imported; owner review required before distribution.'},brand:{path:'assets/icon.png',sha256:await sha256(icon),provenance:'Existing authoritative repository shield; unchanged.'},renderer:{sharp:sharp.versions.sharp,vips:sharp.versions.vips,font:'Existing @expo-google-fonts/inter TTFs; Inter SIL Open Font License'},specifications:{creative:'https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications',screenshots:'https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications',checked:'2026-10-23',accountConfigurationVerified:false},assets:records,pending:{iphone:'Native iOS capture unavailable on Windows. No web captures accepted as native finals.',iphoneDuo:'Native device layouts and captures pending; no optimized-support claim.',ipad:'Not applicable while ios.supportsTablet is false.',previews:'Native recordings and encoded videos pending; no simulated final footage.'}};
data.source.provenance = 'Original AI-generated campaign illustration created with image_gen for this redesign; not user-supplied photography, a real player endorsement, or an app capture.';
data.source.generation = { tool: 'image_gen', promptSummary: 'Anonymous adult footballer aged 25+, plain forest-green kit without logos, ball and visible pitch markings, modest community stadium at blue hour, player in right third and open left text-safe area. No identifiable real player or minor.' };
await writeFile(await safePath('marketing/app-store/manifests/assets.json'),JSON.stringify(data,null,2)+'\n');
await writeFile(await safePath('marketing/source-assets/compositions.json'),JSON.stringify(specs,null,2)+'\n');
console.log(`Composed ${records.length} illustrative exports. Native screenshots/videos remain pending.`);
