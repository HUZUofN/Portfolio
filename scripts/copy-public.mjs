import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const source=path.join(root,'site'),target=path.join(root,'public');
fs.rmSync(target,{recursive:true,force:true});fs.cpSync(source,target,{recursive:true});
console.log('Vercel public/ generated from site/');
