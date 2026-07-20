from __future__ import annotations

from pathlib import Path
import re

ALUMNO = Path("admin/alumno.html")
TRAINING = Path("admin/entrenamiento.html")
MARKER = "YANINA_APPOINTMENT_TRAINING_FOLLOWUP_V3"


def replace_once(text: str, old: str, new: str, label: str, path: Path) -> str:
    if old not in text:
        raise RuntimeError(f"{path}: missing exact target for {label}")
    return text.replace(old, new, 1)


def replace_regex(text: str, pattern: str, replacement: str, label: str, path: Path) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{path}: expected one target for {label}, found {count}")
    return updated


def patch_month_selector(text: str, path: Path) -> str:
    replacement = '''    function populateCalendarMonthSelect() {
      if (!calendarMonthSelect) return;

      const currentValue = monthKey(calendarStartDate);
      const base = startOfMonth(startOfToday());
      let firstMonth = addMonths(base, -60);
      let lastMonth = addMonths(base, 24);

      allClasses.filter(isMeaningfulClass).forEach(item => {
        const classDate = parseISODate(item.class_date);
        if (!classDate) return;
        const classMonth = startOfMonth(classDate);
        if (classMonth < firstMonth) firstMonth = classMonth;
        if (classMonth > lastMonth) lastMonth = classMonth;
      });

      const selectedMonth = startOfMonth(calendarStartDate);
      if (selectedMonth < firstMonth) firstMonth = selectedMonth;
      if (selectedMonth > lastMonth) lastMonth = selectedMonth;

      const options = [];
      for (let cursor = new Date(firstMonth); cursor <= lastMonth; cursor = addMonths(cursor, 1)) {
        const value = monthKey(cursor);
        const label = cursor.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
        options.push(`<option value="${value}" ${value === currentValue ? "selected" : ""}>${label}</option>`);
      }

      calendarMonthSelect.innerHTML = options.join("");
    }

    function toISODate'''
    return replace_regex(
        text,
        r"    function populateCalendarMonthSelect\(\) \{.*?\n    \}\n\n    function toISODate",
        replacement,
        "historical month selector",
        path,
    )


def add_marker(text: str, path: Path) -> str:
    return replace_once(
        text,
        "  </style>",
        f"\n    /* {MARKER} */\n  </style>",
        "follow-up marker",
        path,
    )


# Student record / appointment calendar.
text = ALUMNO.read_text(encoding="utf-8")
if MARKER not in text:
    text = patch_month_selector(text, ALUMNO)

    text = replace_once(
        text,
        '<a href="#plan" class="btn btn-form-secondary">Crear plan de entrenamiento</a>',
        '<a id="createTrainingPlanBtn" href="entrenamiento.html" class="btn btn-form-secondary">Crear plan de entrenamiento</a>',
        "training shortcut",
        ALUMNO,
    )

    text = replace_once(
        text,
        '<p class="card-subtitle">Lista real de clases del alumno. Editar clase selecciona la clase y baja al entrenamiento.</p>',
        '<p class="card-subtitle">Lista real de clases del alumno. Editar clase abre el turno para revisar o modificar hora y comentarios.</p>',
        "appointment list instructions",
        ALUMNO,
    )

    text = replace_once(
        text,
        '''    const trainingTab = document.getElementById("trainingTab");
    const appointmentModal = document.getElementById("appointmentModal");''',
        '''    const trainingTab = document.getElementById("trainingTab");
    const createTrainingPlanBtn = document.getElementById("createTrainingPlanBtn");
    const appointmentModal = document.getElementById("appointmentModal");''',
        "training shortcut constant",
        ALUMNO,
    )

    text = replace_once(
        text,
        '''    function updateTrainingTabLink() {
      if (!trainingTab) return;
      if (studentId) trainingTab.href = `entrenamiento.html?id=${encodeURIComponent(studentId)}`;
      else { trainingTab.href = "#"; trainingTab.onclick = event => { event.preventDefault(); alert("Primero guardá la ficha del alumno para abrir Entrenamiento."); }; }
    }''',
        '''    function updateTrainingTabLink() {
      const target = studentId ? `entrenamiento.html?id=${encodeURIComponent(studentId)}` : "#";
      [trainingTab, createTrainingPlanBtn].filter(Boolean).forEach(link => {
        link.href = target;
        link.onclick = studentId ? null : event => {
          event.preventDefault();
          alert("Primero guardá la ficha del alumno para abrir Entrenamiento.");
        };
      });
    }''',
        "training link behavior",
        ALUMNO,
    )

    text = replace_once(
        text,
        '''    if (addClassBtn) {
      addClassBtn.addEventListener("click", () => openAppointmentModal(toISODate(startOfToday()), null));
    }''',
        '''    if (addClassBtn) {
      addClassBtn.addEventListener("click", () => {
        const todayKey = toISODate(startOfToday());
        const existingToday = classesByDate().get(todayKey)?.[0] || null;
        openAppointmentModal(todayKey, existingToday);
      });
    }''',
        "avoid duplicate appointment today",
        ALUMNO,
    )

    text = replace_once(
        text,
        '''        const saved = await response.json();
        if (appointmentClassId) allClasses = allClasses.map(item => Number(item.id) === Number(saved.id) ? saved : item); else allClasses.push(saved);
        allClasses.sort((a,b) => String(a.class_date || "").localeCompare(String(b.class_date || "")) || String(a.class_time || "").localeCompare(String(b.class_time || "")));
        appointmentClassId = String(saved.id); appointmentClassSnapshot = { ...saved }; renderCalendarAndClasses(); showAppointmentState("Cita guardada."); setAppointmentEditing(false);''',
        '''        const responseData = await response.json();
        const saved = { ...previous, ...payload, ...responseData };
        if (!saved.id && appointmentClassId) saved.id = appointmentClassId;
        if (!saved.id) throw new Error("La cita se guardó, pero la API no devolvió su identificador.");
        if (appointmentClassId) allClasses = allClasses.map(item => Number(item.id) === Number(saved.id) ? saved : item); else allClasses.push(saved);
        allClasses.sort((a,b) => String(a.class_date || "").localeCompare(String(b.class_date || "")) || String(a.class_time || "").localeCompare(String(b.class_time || "")));
        appointmentClassId = String(saved.id); appointmentClassSnapshot = { ...saved }; renderCalendarAndClasses(); showAppointmentState("Cita guardada."); setAppointmentEditing(false);''',
        "appointment response merge",
        ALUMNO,
    )

    text = add_marker(text, ALUMNO)
    ALUMNO.write_text(text, encoding="utf-8")


# Dedicated training page.
text = TRAINING.read_text(encoding="utf-8")
if MARKER not in text:
    text = patch_month_selector(text, TRAINING)

    text = replace_once(
        text,
        '>Guardar rutina</button>',
        '>Guardar clase y rutina</button>',
        "training save label",
        TRAINING,
    )

    text = replace_once(
        text,
        '''      renderCalendarAndClasses();

      const requestedClass = targetClassId
        ? allClasses.find(item => String(item.id) === String(targetClassId))
        : null;
      const firstMeaningfulClass = allClasses.find(isMeaningfulClass);

      if (requestedClass) {
        await selectClass(requestedClass.id, false);
        const target = targetSection === "videos"
          ? document.getElementById("classVideosAdmin")
          : targetSection === "comments"
            ? document.getElementById("classCommentsAdmin")
            : document.getElementById("clase-seleccionada");
        requestAnimationFrame(() => target?.scrollIntoView({ behavior: "smooth", block: "start" }));
      } else if (firstMeaningfulClass && !selectedClass) {
        await selectClass(firstMeaningfulClass.id, false);
      }

      return allClasses;''',
        '''      renderCalendarAndClasses();

      const requestedClass = targetClassId
        ? allClasses.find(item => String(item.id) === String(targetClassId))
        : null;
      const meaningfulClasses = allClasses.filter(isMeaningfulClass);
      const todayKey = toISODate(startOfToday());
      const nextClass = meaningfulClasses.find(item => String(item.class_date || "") >= todayKey) || null;
      const pastClasses = meaningfulClasses.filter(item => String(item.class_date || "") < todayKey);
      const defaultClass = nextClass || pastClasses[pastClasses.length - 1] || meaningfulClasses[0] || null;
      const classToOpen = requestedClass || defaultClass;

      if (classToOpen) {
        await selectClass(classToOpen.id, false);
        if (requestedClass) {
          const target = targetSection === "videos"
            ? document.getElementById("classVideosAdmin")
            : targetSection === "comments"
              ? document.getElementById("classCommentsAdmin")
              : document.getElementById("clase-seleccionada");
          requestAnimationFrame(() => target?.scrollIntoView({ behavior: "smooth", block: "start" }));
        }
      }

      return allClasses;''',
        "default training class",
        TRAINING,
    )

    text = replace_once(
        text,
        '''      selectedClass = found;
      activeBackendClassId = String(found.id);''',
        '''      const selectedDate = parseISODate(found.class_date);
      if (selectedDate) calendarStartDate = startOfMonth(selectedDate);

      selectedClass = found;
      activeBackendClassId = String(found.id);''',
        "selected class calendar month",
        TRAINING,
    )

    text = replace_once(
        text,
        '''    async function saveClassAndRoutine() {
      const historicalEdit = isClassStarted();
      const changed = routineIsDirty();
      const editComment = String(historicalEditComment?.value || "").trim();

      if (historicalEdit && !changed) return { unchanged: true };
      if (historicalEdit && !editComment) {
        historicalEditBox?.classList.add("is-visible");
        historicalEditComment?.focus();
        throw new Error("Agregá un comentario sobre la edición antes de guardar la rutina.");
      }

      const savedClass = historicalEdit ? selectedClass : await saveCalendarChanges();
      const classId = savedClass?.id || activeBackendClassId;

      if (!classId) {
        throw new Error("Primero guardá la clase en el calendario.");
      }

      activeBackendClassId = String(classId);

      const payload = {''',
        '''    async function saveClassAndRoutine() {
      const historicalEdit = isClassStarted();
      const changed = routineIsDirty();
      const classChanged = Boolean(selectedClass?.id && dirtyClassIds.has(String(selectedClass.id)));
      const editComment = String(historicalEditComment?.value || "").trim();

      if (historicalEdit && !changed && !classChanged) return { unchanged: true };
      if (historicalEdit && changed && !editComment) {
        historicalEditBox?.classList.add("is-visible");
        historicalEditComment?.focus();
        throw new Error("Agregá un comentario sobre la edición antes de guardar la rutina.");
      }

      const savedClass = await saveCalendarChanges();
      const classId = savedClass?.id || activeBackendClassId;

      if (!classId) {
        throw new Error("Primero guardá la clase en el calendario.");
      }

      activeBackendClassId = String(classId);
      if (!changed) return savedClass;

      const payload = {''',
        "historical class metadata persistence",
        TRAINING,
    )

    text = replace_once(
        text,
        '''        await loadStudentFromBackend();
        await loadMeasurementsFromBackend();
        await loadClassesFromBackend();''',
        '''        await loadStudentFromBackend();
        await loadClassesFromBackend();''',
        "skip hidden measurements on training page",
        TRAINING,
    )

    text = add_marker(text, TRAINING)
    TRAINING.write_text(text, encoding="utf-8")


for path in (ALUMNO, TRAINING):
    data = path.read_text(encoding="utf-8")
    required = [
        MARKER,
        "function populateCalendarMonthSelect()",
        "calendarStartDate",
        "appointment",
    ]
    missing = [item for item in required if item not in data]
    if missing:
        raise RuntimeError(f"{path}: missing required markers {missing}")

print("Applied final appointment and training history refinements")
