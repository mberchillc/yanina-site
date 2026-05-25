from pathlib import Path

admin_path = Path('admin/alumno.html')
student_path = Path('alumno/index.html')

admin = admin_path.read_text(encoding='utf-8')
student = student_path.read_text(encoding='utf-8')
admin_original = admin
student_original = student

# --- ADMIN: library select in routine table ---
if 'let exerciseLibrary = [];' not in admin:
    admin = admin.replace(
        '    let allClasses = [];\n',
        '    let exerciseLibrary = [];\n    let allClasses = [];\n'
    )

admin_helpers = r'''
    async function loadExerciseLibrary() {
      try {
        const response = await fetch(`../exercises.json?cache=${Date.now()}`);
        if (!response.ok) throw new Error("No se pudo cargar la biblioteca");
        const data = await response.json();
        exerciseLibrary = Array.isArray(data) ? data : [];
      } catch (error) {
        console.error(error);
        exerciseLibrary = [];
      }
    }

    function findLibraryExerciseByName(name) {
      const clean = String(name || "").trim().toLowerCase();
      if (!clean) return null;
      return exerciseLibrary.find(item => String(item.name || "").trim().toLowerCase() === clean) || null;
    }

    function exerciseOptions(selectedName) {
      const selected = String(selectedName || "").trim();
      const selectedLower = selected.toLowerCase();
      const options = [`<option value="">Nuevo ejercicio</option>`];
      const categories = [...new Set(exerciseLibrary.map(item => item.category || "Biblioteca"))];

      categories.forEach(category => {
        const items = exerciseLibrary.filter(item => (item.category || "Biblioteca") === category);
        options.push(`<optgroup label="${escapeHtml(category)}">`);
        items.forEach(item => {
          const name = item.name || "";
          const isSelected = selectedLower && selectedLower === String(name).trim().toLowerCase();
          options.push(`<option value="${escapeHtml(name)}" ${isSelected ? "selected" : ""}>${escapeHtml(name)}</option>`);
        });
        options.push(`</optgroup>`);
      });

      if (selected && selectedLower !== "nuevo ejercicio" && !findLibraryExerciseByName(selected)) {
        options.splice(1, 0, `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>`);
      }

      return options.join("");
    }
'''
if 'async function loadExerciseLibrary()' not in admin:
    admin = admin.replace('    function startOfToday() {', admin_helpers + '\n    function startOfToday() {')

old_create = r'''    function createExerciseRow(exercise = "", series = "", reps = "", carga = "") {
      const row = document.createElement("div");
      row.className = "exercise-row";

      const values = [
        exercise || "Nuevo ejercicio",
        series || "3",
        reps || "10",
        carga || "—"
      ];

      values.forEach(value => {
        const cell = document.createElement("span");
        cell.contentEditable = "true";
        cell.textContent = value;
        row.appendChild(cell);
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "delete-exercise-btn";
      deleteBtn.textContent = "Eliminar";
      deleteBtn.addEventListener("click", () => row.remove());

      row.appendChild(deleteBtn);
      return row;
    }
'''
new_create = r'''    function createExerciseRow(exercise = "", series = "", reps = "", carga = "") {
      const row = document.createElement("div");
      row.className = "exercise-row";

      const select = document.createElement("select");
      select.className = "exercise-library-select";
      select.innerHTML = exerciseOptions(exercise || "");
      row.appendChild(select);

      const values = [
        series || "3",
        reps || "10",
        carga || "—"
      ];

      values.forEach(value => {
        const cell = document.createElement("span");
        cell.contentEditable = "true";
        cell.textContent = value;
        row.appendChild(cell);
      });

      select.addEventListener("change", () => {
        const selected = findLibraryExerciseByName(select.value);
        const cells = row.querySelectorAll("span");
        if (!selected || cells.length < 3) return;
        if (!cells[0].textContent.trim() || cells[0].textContent.trim() === "3") cells[0].textContent = selected.default_sets || "3";
        if (!cells[1].textContent.trim() || cells[1].textContent.trim() === "10") cells[1].textContent = selected.default_reps || "10";
        if (!cells[2].textContent.trim() || cells[2].textContent.trim() === "—") cells[2].textContent = selected.default_load || "—";
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "delete-exercise-btn";
      deleteBtn.textContent = "Eliminar";
      deleteBtn.addEventListener("click", () => row.remove());

      row.appendChild(deleteBtn);
      return row;
    }
'''
if old_create in admin:
    admin = admin.replace(old_create, new_create)

old_collect = r'''        const cells = row.querySelectorAll("span");

        const exercise = {
          exercise_name: cells[0]?.textContent.trim() || "",
          sets: cells[1]?.textContent.trim() || "",
          reps_time: cells[2]?.textContent.trim() || "",
          load: cells[3]?.textContent.trim() || ""
        };
'''
new_collect = r'''        const select = row.querySelector(".exercise-library-select");
        const cells = row.querySelectorAll("span");

        const exercise = {
          exercise_name: select?.value || "",
          sets: cells[0]?.textContent.trim() || "",
          reps_time: cells[1]?.textContent.trim() || "",
          load: cells[2]?.textContent.trim() || ""
        };
'''
if old_collect in admin:
    admin = admin.replace(old_collect, new_collect)

old_duplicate = r'''          const cells = row.querySelectorAll("span");
          exerciseTable.appendChild(
            createExerciseRow(
              cells[0]?.textContent || "",
              cells[1]?.textContent || "",
              cells[2]?.textContent || "",
              cells[3]?.textContent || ""
            )
          );
'''
new_duplicate = r'''          const select = row.querySelector(".exercise-library-select");
          const cells = row.querySelectorAll("span");
          exerciseTable.appendChild(
            createExerciseRow(
              select?.value || "",
              cells[0]?.textContent || "",
              cells[1]?.textContent || "",
              cells[2]?.textContent || ""
            )
          );
'''
if old_duplicate in admin:
    admin = admin.replace(old_duplicate, new_duplicate)

if 'await loadExerciseLibrary();' not in admin:
    admin = admin.replace(
        '        updateStudentIdentity();\n\n        if (isNewStudent) {',
        '        updateStudentIdentity();\n        await loadExerciseLibrary();\n\n        if (isNewStudent) {'
    )

# Add minimal style for selects if not present
if '.exercise-library-select' not in admin.split('</style>')[0]:
    admin = admin.replace(
        '    @media (max-width: 840px) {',
        '    .exercise-library-select { width: 100%; border: 0; background: transparent; color: var(--green-dark); font: inherit; font-weight: 800; outline: none; }\n\n    @media (max-width: 840px) {'
    )

# --- STUDENT: illustrated routine cards from library ---
if 'let exerciseLibrary = [];' not in student:
    student = student.replace("let classes=[];", "let exerciseLibrary=[];let classes=[];")

student_helpers = r'''function getExerciseAssetPath(path){if(!path)return '';return String(path).startsWith('../')?String(path):`../${path}`}function findLibraryExerciseByName(name){const clean=String(name||'').trim().toLowerCase();return exerciseLibrary.find(item=>String(item.name||'').trim().toLowerCase()===clean)||null}async function loadExerciseLibrary(){try{const r=await fetch(`../exercises.json?cache=${Date.now()}`);if(!r.ok)throw new Error('library');const data=await r.json();exerciseLibrary=Array.isArray(data)?data:[]}catch(e){console.error(e);exerciseLibrary=[]}}function renderRoutineExercise(e,i){const libraryItem=findLibraryExerciseByName(e.exercise_name);if(!libraryItem){return `<article class="routine-item"><img src="${iconFor(i)}" alt=""><div><h4>${esc(e.exercise_name)}</h4><p>${esc(e.sets)} series · ${esc(e.reps_time)} · ${esc(e.load||'sin carga')}</p></div><span class="tag">Ejercicio</span></article>`}return `<article class="card"><h3>${esc(libraryItem.name)}</h3><p class="muted">${esc(e.sets)} series · ${esc(e.reps_time)} · ${esc(e.load||'sin carga')}</p><div class="exercise-grid">${(libraryItem.steps||[]).slice(0,3).map((step,index)=>`<article class="exercise-step-card"><img src="${esc(getExerciseAssetPath(step.image))}" alt="${esc(libraryItem.name)} - ${esc(step.title)}"><div class="exercise-step-body"><h3>${index+1}. ${esc(step.title)}</h3><p>${esc(step.text)}</p></div></article>`).join('')}</div></article>`}
'''
if 'function renderRoutineExercise(e,i)' not in student:
    student = student.replace('function videoKey(){', student_helpers + 'function videoKey(){')

old_student_render = "$('routineList').innerHTML=ex.length?ex.map((e,i)=>`<article class=\"routine-item\"><img src=\"${iconFor(i)}\" alt=\"\"><div><h4>${esc(e.exercise_name)}</h4><p>${esc(e.sets)} series · ${esc(e.reps_time)} · ${esc(e.load||\'sin carga\')}</p></div><span class=\"tag\">Ejercicio</span></article>`).join(''):'<div class=\"empty\">Esta clase todavía no tiene ejercicios cargados.</div>'"
new_student_render = "$('routineList').innerHTML=ex.length?ex.map((e,i)=>renderRoutineExercise(e,i)).join(''):'<div class=\"empty\">Esta clase todavía no tiene ejercicios cargados.</div>'"
if old_student_render in student:
    student = student.replace(old_student_render, new_student_render)

if 'await loadExerciseLibrary();await loadStudent();' not in student:
    student = student.replace('async function init(){try{await loadStudent();', 'async function init(){try{await loadExerciseLibrary();await loadStudent();')

if admin != admin_original:
    admin_path.write_text(admin, encoding='utf-8')
if student != student_original:
    student_path.write_text(student, encoding='utf-8')

print('admin changed', admin != admin_original)
print('student changed', student != student_original)
