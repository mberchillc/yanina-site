import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const files = {
  management: read('admin/gestion-administrativa.html'),
  adminHistory: read('admin/historial-pagos.html'),
  studentHome: read('alumno/index.html'),
  studentHistory: read('alumno/historial-pagos.html'),
  studentPayment: read('alumno/pago.html'),
  adminNotifications: read('admin/notificaciones.html'),
  studentNotifications: read('alumno/notificaciones.html'),
  migration: read('migrations/2026-07-21-auth-payment-workflow.sql')
};

for (const [name, html] of Object.entries(files).filter(([, value]) => value.includes('<script'))) {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
  assert.ok(scripts.length, `${name} should contain executable scripts`);
  for (const script of scripts) new Function(script);
}

assert.match(files.management, /count=monthClasses\(\)\.length/, 'all appointments, including same-day appointments, must be counted');
assert.match(files.management, /async function loadSavedSummary\(/, 'saved summaries must reload in management');
assert.match(files.management, /\/payment-summary\?month=/, 'management must read the persisted summary');
assert.match(files.management, /adminPreview=1/, 'admin preview must carry admin authorization context');

assert.match(files.adminHistory, /Authorization/, 'admin history must send the admin token');
assert.match(files.adminHistory, /adminPreview=1/, 'Ver como alumna must use the persisted admin preview');
assert.match(files.studentHistory, /Authorization/, 'student history must send the active session token');
assert.match(files.studentPayment, /Authorization/, 'student payment must send the active session token');
assert.match(files.studentPayment, /Pago realizado/, 'the existing payment action must remain available');

assert.match(files.studentHome, /\.tab-btn\.pending-alert\{background:#fff1dc/, 'Pendientes must keep the approved peach color');
assert.match(files.studentHome, /refreshPendingNav\(\)/, 'Pendientes state must refresh from persisted data');
assert.match(files.studentHome, /refreshStudentBell\(\)/, 'student bell state must refresh');
assert.match(files.adminNotifications, /Authorization/, 'admin notifications must use the admin session');
assert.match(files.studentNotifications, /Authorization/, 'student notifications must use the student session');

assert.match(files.migration, /password_setup_version = 1/, 'legacy hash flags must be normalized');
assert.match(files.migration, /randomblob\(4\)/, 'passwordless accounts must receive the standard one-time setup path');
assert.match(files.migration, /payment_summary_notify_student_insert/, 'new pending summaries must notify students');
assert.match(files.migration, /payment_summary_notify_student_update/, 'updated pending summaries must notify students');

console.log('Yanina auth, resumen, Pendientes, history, and notification regression checks passed.');
