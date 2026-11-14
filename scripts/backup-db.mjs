// Consistent point-in-time SQLite backup using VACUUM INTO; run on a writable host with DB_PATH set.
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const source=path.resolve(root,process.env.DB_PATH||'./data/leads.db');
if(!fs.existsSync(source)){console.error('Database not found:',source);process.exit(1);}
const target=process.argv[2]||path.join(root,'backups',`leads-${new Date().toISOString().replaceAll(':','-')}.db`);
fs.mkdirSync(path.dirname(target),{recursive:true});
if(fs.existsSync(target)){console.error('Refusing to overwrite existing backup');process.exit(1);}
const db=new DatabaseSync(source);
try{db.exec(`VACUUM INTO '${path.resolve(target).replaceAll("'","''")}'`);console.log('Consistent SQLite backup created at:',target);}finally{db.close();}
