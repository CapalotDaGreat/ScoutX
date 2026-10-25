import assert from 'node:assert/strict';
import { checkedPath, safePath } from './marketing-lib.mjs';
for (const input of ['../assets/icon.png','marketing/../assets/icon.png','marketing/a/../../x','marketing//x','marketing/./x','marketing\\x','C:/outside.png',null,42]) assert.throws(()=>checkedPath(input));
assert.ok(checkedPath('marketing/source-assets/generated-football-master.png').endsWith('generated-football-master.png'));
await safePath('marketing/source-assets/generated-football-master.png');
console.log('PASS: strict path input guards (9 invalid cases, 1 valid case), Windows ancestor traversal terminates.');
