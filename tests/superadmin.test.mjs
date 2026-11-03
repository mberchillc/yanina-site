import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'worker/worker.js'), 'utf8');
// The production invitation is never needed to test setup; use a separate in-memory invitation.
const invitation = 'test-only-private-invitation';
const digest = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(invitation))).toString('hex');
const testSource = source.replace(/const SUPERADMIN_INVITE_SHA256 = "[a-f0-9]+";/, `const SUPERADMIN_INVITE_SHA256 = "${digest}";`)
  .replace(/const SUPERADMIN_INVITE_EXPIRES = \d+;/, `const SUPERADMIN_INVITE_EXPIRES = ${Date.now()+60000};`);
const {default: worker} = await import('data:text/javascript;base64,'+Buffer.from(testSource).toString('base64'));
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE students (id INTEGER PRIMARY KEY, full_name TEXT);
  CREATE TABLE classes (id INTEGER PRIMARY KEY, student_id INTEGER, class_date TEXT);
  INSERT INTO students VALUES (1, 'Alumna activa'), (19, 'Alumno de prueba');
  INSERT INTO classes VALUES (7, 1, '2026-11-02');`);
const env = { AUTH_SECRET:'legacy-secret', DB: { prepare(sql) {
  let params=[];
  return {
    bind(...args) { params=args; return this; },
    async first() { return db.prepare(sql).get(...params) || null; },
    async all() { return { results: db.prepare(sql).all(...params) }; },
    async run() { return { meta: db.prepare(sql).run(...params) }; }
  };
}}};
async function call(route, {data, token, method=data?'POST':'GET'}={}) {
  const response=await worker.fetch(new Request('https://test.local'+route, {method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})}),env);
  return {status:response.status,body:await response.json(),headers:response.headers};
}
const credentials={username:'mauro',password:'a long unique password 2026'};
assert.equal((await call('/api/superadmin/students')).status,401);
assert.equal((await call('/api/superadmin/setup',{data:{...credentials,invite:'wrong'}})).status,403);
assert.equal((await call('/api/superadmin/setup',{data:{...credentials,password:'short',invite:invitation}})).status,400);
assert.equal((await call('/api/superadmin/setup',{data:{...credentials,invite:invitation}})).status,200);
assert.equal((await call('/api/superadmin/setup',{data:{...credentials,invite:invitation}})).status,409);
const stored=db.prepare('SELECT * FROM platform_superadmin').get();
assert.notEqual(stored.password_hash, credentials.password);
assert.equal(stored.password_hash.length,64);
assert.equal((await call('/api/superadmin/login',{data:{...credentials,password:'wrong'}})).status,401);
const owner=await call('/api/superadmin/login',{data:credentials});
assert.equal(owner.status,200); assert.equal(owner.body.role,'superadmin');
assert.equal(owner.headers.get('cache-control'),'no-store');
const token=owner.body.token;
assert.equal((await call('/api/superadmin/me',{token})).status,200);
assert.equal((await call('/api/superadmin/me',{token:token+'x'})).status,401);
const students=await call('/api/superadmin/students',{token});
assert.equal(students.body[0].id,1); assert.equal(students.body[0].classes_count,1);
assert.equal((await call('/api/superadmin/view',{token,data:{view:'student',student_id:999}})).status,404);
const student=await call('/api/superadmin/view',{token,data:{view:'student',student_id:1}});
assert.equal(student.status,200);
assert.equal((await call('/api/superadmin/students',{token:student.body.token})).status,401);
assert.equal((await call('/api/students/19/classes',{token:student.body.token})).status,403);
assert.equal((await call('/api/students/1/measurements',{token:student.body.token,data:{weight_kg:99}})).status,403);
const trainer=await call('/api/superadmin/view',{token,data:{view:'admin'}});
assert.equal(trainer.status,200);
assert.equal((await call('/api/students/1',{token:trainer.body.token,method:'DELETE'})).status,403);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM students').get().count,2);
assert.equal((await call('/api/superadmin/view',{token:trainer.body.token,data:{view:'admin'}})).status,401);
// Tampering with preview permissions cannot turn a read-only token into a writable one.
const parts=student.body.token.split('.');
const payload=JSON.parse(Buffer.from(parts[0],'base64url').toString()); payload.read_only=false;
const forged=Buffer.from(JSON.stringify(payload)).toString('base64url')+'.'+parts[1];
assert.equal((await call('/api/students/1/measurements',{token:forged,data:{}})).status,401);
// Legacy Yanina tokens retain their format and work alongside the new independent signing secret.
const legacyPayload=Buffer.from(JSON.stringify({role:'admin',username:'yanina',exp:Date.now()+60000})).toString('base64url');
const legacyKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.AUTH_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
const legacyToken=legacyPayload+'.'+Buffer.from(await crypto.subtle.sign('HMAC',legacyKey,new TextEncoder().encode(legacyPayload))).toString('base64url');
assert.equal((await call('/api/superadmin/me',{token:legacyToken})).status,401);
for(let i=0;i<5;i++) await call('/api/superadmin/login',{data:{...credentials,password:'wrong'}});
assert.equal((await call('/api/superadmin/login',{data:credentials})).status,429);
db.prepare('UPDATE platform_superadmin SET locked_until=0').run();
assert.equal((await call('/api/superadmin/login',{data:credentials})).status,200);
db.prepare("UPDATE platform_superadmin SET session_secret='rotated'").run();
assert.equal((await call('/api/superadmin/me',{token})).status,401);
assert.equal((await call('/api/students/1/classes',{token:student.body.token})).status,401);

function memoryStorage() { const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}; }
const local=memoryStorage(), session=memoryStorage();
local.setItem('yaninaStudentSession','real-student-session');
session.setItem('yaninaSuperadmin',JSON.stringify({token:'owner',exp:Date.now()+60000}));
const context={window:{fetch:()=>{}},localStorage:local,sessionStorage:session,location:{pathname:'/superadmin/'},URL,Response,Date,JSON,document:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'assets/superadmin-access-v2.js'),'utf8'),context);
assert.equal(context.window.YaninaAccess.storage.getItem('yaninaStudentSession'),null);
context.window.YaninaAccess.storage.setItem('yaninaStudentSession','preview');
assert.equal(session.getItem('yaninaStudentSession'),'preview');
assert.equal(local.getItem('yaninaStudentSession'),'real-student-session');
session.removeItem('yaninaSuperadmin');
assert.equal(context.window.YaninaAccess.storage.getItem('yaninaStudentSession'),'real-student-session');

// The student screen wraps the global fetch function to add its own token. Owner API
// requests must keep the Superadmin token when the switcher loads or changes views.
const ownerSession=memoryStorage();
ownerSession.setItem('yaninaSuperadmin',JSON.stringify({token:'owner-token',username:'mauro',exp:Date.now()+60000}));
const requests=[];
const navigation=[];
const transport=async (url,init)=>{
  requests.push({url,authorization:new Headers(init.headers).get('Authorization')});
  return Response.json(url.endsWith('/view')?{view:'student',student_id:1,name:'Alumna activa',token:'preview-token',exp:Date.now()+60000}:[]);
};
const browser={fetch:transport,localStorage:memoryStorage(),sessionStorage:ownerSession,location:{pathname:'/superadmin/',href:'https://yaninatrainer.net/superadmin/',origin:'https://yaninatrainer.net',assign:url=>navigation.push(url)},URL,Response,Headers,Date,JSON,document:{}};
browser.window=browser;
vm.runInNewContext(fs.readFileSync(path.join(root,'assets/superadmin-access-v2.js'),'utf8'),browser);
browser.fetch=(url,init={})=>transport(url,{...init,headers:{...init.headers,Authorization:'Bearer student-preview-token'}});
await browser.YaninaAccess.api('students');
await browser.YaninaAccess.switchView('1');
assert.ok(requests.every(request=>request.authorization==='Bearer owner-token'),'student fetch wrapper must not overwrite owner authorization');
assert.deepEqual(navigation,['https://yaninatrainer.net/alumno/index.html?id=1&sa=20261103-3']);
assert.equal(browser.YaninaAccess.previewHref('https://other.example/path'), 'https://other.example/path');
assert.equal(browser.YaninaAccess.previewHref('/alumno/entrenamiento.html?classId=7'), 'https://yaninatrainer.net/alumno/entrenamiento.html?classId=7&sa=20261103-3');
assert.equal(JSON.parse(ownerSession.getItem('yaninaStudentSession')).token,'preview-token');
assert.equal(JSON.parse(ownerSession.getItem('yaninaSuperadmin')).token,'owner-token');

// Every page that consumes the preview adapter must load it before any inline guard.
for(const dir of ['admin','alumno','student']) for(const file of fs.readdirSync(path.join(root,dir)).filter(f=>f.endsWith('.html'))) {
  const html=fs.readFileSync(path.join(root,dir,file),'utf8');
  assert.ok(html.includes('/assets/superadmin-access-v2.js?'),dir+'/'+file);
  for(const match of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) if(!match[1]?.includes('src=')) new Function(match[2]);
}
for(const match of fs.readFileSync(path.join(root,'superadmin/index.html'),'utf8').matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) if(!match[1]?.includes('src=')) new Function(match[2]);
console.log('Superadmin setup, one-time invite, login, lockout, signatures, scoped previews, read-only restrictions and session isolation passed.');
