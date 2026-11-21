import 'dotenv/config';
import pg from 'pg';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const url=new URL(process.env.DATABASE_URL);
const name='medrep_load_'+randomBytes(6).toString('hex');
const control=new pg.Client({connectionString:url.toString()});
await control.connect();
try {
 await control.query('CREATE DATABASE "'+name+'"');
 const isolated=new URL(url);isolated.pathname='/'+name;
 const env={...process.env,DATABASE_URL:isolated.toString(),DB_POOL_MAX:'10'};
 for(const args of [
  ['prisma','migrate','deploy','--config','prisma7.config.ts'],
  ['tsx','prisma/seed.ts'],
  ['tsx','scripts/load-rounds.ts']
 ]) {
  const result=spawnSync('npx',args,{env,stdio:'inherit'});
  if(result.status!==0){process.exitCode=result.status??1;break;}
 }
} finally {
 await control.query('DROP DATABASE IF EXISTS "'+name+'" WITH (FORCE)');
 await control.end();
 console.log('Dedicated load database removed');
}
