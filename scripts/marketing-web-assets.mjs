import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadSharp, safePath } from './marketing-lib.mjs';

const sharp = loadSharp();
const source = await safePath('marketing/source-assets/generated-football-master.png');
const output = resolve('public/welcome/img/next-era');
await mkdir(output, { recursive: true });
await sharp(source).webp({ quality: 85 }).toFile(resolve(output, 'football-hero.webp'));
await sharp(source).resize(780, 1040, { fit: 'cover', position: 'right' }).webp({ quality: 85 }).toFile(resolve(output, 'football-hero-mobile.webp'));
await copyFile(await safePath('marketing/social/open-graph.png'), resolve(output, 'open-graph.png'));
console.log('Website hero: 1672x941; independent right-focused mobile crop: 780x1040. Generated campaign illustration.');
