import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const controller = read('assets/measurement-history.js');
const studentAdapter = read('assets/measurement-history-student.js');
const adminProfile = read('admin/alumno.html');
const adminTraining = read('admin/entrenamiento.html');
const studentProfile = read('alumno/index.html');

for (const file of [adminProfile, adminTraining, studentProfile]) {
  assert.match(file, /measurement-history\.css\?v=20260722-1/);
  assert.match(file, /measurement-history\.js\?v=20260722-1/);
}

for (const file of [adminProfile, adminTraining]) {
  assert.match(file, /datasets\[config\.key\]\.slice\(-6\)/);
  assert.match(file, /YaninaMeasurementHistory\?\.bind/);
}

assert.match(studentProfile, /measurement-history-student\.js\?v=20260722-1/);
assert.match(studentAdapter, /datasets\[config\.key\]\.slice\(-6\)/);
assert.match(studentAdapter, /date:\s*measurementDate\(item\)/);
assert.match(studentAdapter, /weight:[\s\S]*fat:[\s\S]*muscle:/);

assert.match(controller, /const WINDOW_SIZE = 6/);
assert.match(controller, /type="range"/);
assert.match(controller, /moveWindow\(-1\)/);
assert.match(controller, /moveWindow\(1\)/);
assert.match(controller, /pointerdown/);
assert.match(controller, /pointerup/);
assert.match(controller, /previous\.disabled = activeHistory\.start === 0/);
assert.match(controller, /next\.disabled = activeHistory\.start === maxStart/);
assert.match(controller, /Mediciones \$\{start \+ 1\}–\$\{end\} de \$\{points\.length\}/);

const script = new vm.Script(controller, { filename: 'measurement-history.js' });
const context = vm.createContext({ window: {} });
script.runInContext(context);
assert.equal(context.window.YaninaMeasurementHistory.windowSize, 6);
assert.equal(typeof context.window.YaninaMeasurementHistory.bind, 'function');

console.log('Measurement history six-point summary and full-history navigation checks passed.');
