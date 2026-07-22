import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const dashboard = read('alumno/index.html');
const page = read('alumno/entrenamiento.html');
const navigation = read('assets/student-training-navigation.js');
const training = read('assets/student-training.js');

assert.match(dashboard, /student-training-navigation\.js\?v=20260722-1/);
assert.match(navigation, /textContent = 'Entrenamiento'/);
assert.match(navigation, /viewDate = new Date\(\)/, 'calendar must reset to the real current month');
assert.match(navigation, /data-training-class-id/);
assert.match(navigation, /entrenamiento\.html\$\{query\}/);
assert.doesNotMatch(navigation, /selectClass\(button\.dataset/, 'green dates must navigate instead of opening the embedded routine');

assert.match(page, /<h2>Rutina<\/h2>/);
assert.match(page, /<h2>Comentarios de esta clase<\/h2>/);
assert.ok(page.indexOf('<h2>Rutina</h2>') < page.indexOf('<h2>Comentarios de esta clase</h2>'));
assert.match(page, /id="videoFile"/);
assert.match(page, /id="videoNote"/);
assert.match(page, /id="classCommentInput"/);

assert.match(training, /const STUDENT_ID = String\(session\.studentId\)/, 'student id must come from the authenticated session');
assert.match(training, /classes\.find\(item => String\(item\.id\) === String\(requestedClassId\)\)/, 'requested class must belong to the signed-in student');
assert.match(training, /dateIso\(item\.class_date\) === today/);
assert.match(training, /dateIso\(item\.class_date\) > today/);
assert.match(training, /videos\/direct-upload/);
assert.match(training, /author_role: 'student'/);
assert.doesNotMatch(training, /saveClassAndRoutine|saveCalendarChanges|method:\s*'DELETE'/, 'students must not receive trainer editing actions');
assert.doesNotMatch(page, /Guardar rutina|Editar cita|Eliminar clase|Agregar ejercicio/);

console.log('Student Entrenamiento routing, read-only routine, upload, and comment checks passed.');
