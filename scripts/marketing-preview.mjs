import { writeFile } from 'node:fs/promises';
import { loadSharp, manifest, safePath } from './marketing-lib.mjs';
if (process.argv.length !== 2) throw new Error('Usage: node scripts/marketing-preview.mjs');
const sharp = loadSharp();
const data = await manifest();
const cells=[];
for (let i=0;i<data.assets.length;i++) {
  const a=data.assets[i];
  cells.push({input:await sharp(await safePath(a.exportPath)).resize(600,360,{fit:'contain',background:'#121210'}).png().toBuffer(),left:(i%2)*620+10,top:Math.floor(i/2)*390+10});
}
await sharp({create:{width:1240,height:Math.ceil(cells.length/2)*390,channels:3,background:'#deded9'}}).composite(cells).png().toFile(await safePath('marketing/contact-sheet.png'));
const cards=data.assets.map(a=>`<figure><img src="${a.exportPath.slice('marketing/'.length)}" width="${a.width}" height="${a.height}" alt="PitchProof illustrative campaign: ${a.placement}"><figcaption>${a.exportPath} | ${a.width} x ${a.height} | owner review pending</figcaption></figure>`).join('\n');
await writeFile(await safePath('marketing/preview.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>PitchProof campaign review</title><style>body{margin:24px;background:#121210;color:#fff;font:16px system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr));gap:24px}figure{margin:0;min-width:0}img{width:100%;height:auto}figcaption{overflow-wrap:anywhere;font-size:13px;padding:12px 0;color:#bbb}</style><h1>PitchProof campaign review</h1><p>Generated illustration, not app captures. Native screenshots and videos pending. No App Store acceptance claimed.</p><main>${cards}</main></html>`);
console.log('Preview: marketing/preview.html; contact sheet: marketing/contact-sheet.png');
