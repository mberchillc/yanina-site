from __future__ import annotations

from pathlib import Path

PAGES = (Path("admin/alumno.html"), Path("admin/entrenamiento.html"))


def replace_once(text: str, old: str, new: str, label: str, path: Path) -> str:
    if old not in text:
        raise RuntimeError(f"{path}: missing patch target: {label}")
    return text.replace(old, new, 1)


for path in PAGES:
    text = path.read_text(encoding="utf-8")

    text = replace_once(
        text,
        '<p class="card-subtitle">Lista real de clases del alumno. Editar clase selecciona la clase y baja al entrenamiento.</p>',
        '<p class="card-subtitle">Lista real de clases del alumno. Editar clase abre el turno para revisar o modificar hora y comentarios.</p>',
        "upcoming class instructions",
        path,
    )

    text = replace_once(
        text,
        '<a href="#plan" class="btn btn-form-secondary">Crear plan de entrenamiento</a>',
        '<a id="createTrainingPlanBtn" href="entrenamiento.html" class="btn btn-form-secondary">Crear plan de entrenamiento</a>',
        "training shortcut",
        path,
    )

    text = replace_once(
        text,
        '            <button type="button" class="btn btn-form-primary" id="saveClassBtn">Guardar calendario</button>\n',
        '',
        "obsolete calendar save button",
        path,
    )

    text = replace_once(
        text,
        '    const studentTrainingTab = document.getElementById("studentTrainingTab");\n    const studentMeasurementsTab = document.getElementById("studentMeasurementsTab");',
        '    const studentTrainingTab = document.getElementById("studentTrainingTab");\n    const studentMeasurementsTab = document.getElementById("studentMeasurementsTab");\n    const createTrainingPlanBtn = document.getElementById("createTrainingPlanBtn");',
        "training shortcut constant",
        path,
    )

    text = replace_once(
        text,
        '''      if (studentTrainingTab) {
        studentTrainingTab.href = hasStudent ? `entrenamiento.html?id=${encodeURIComponent(studentId)}` : "#";
        studentTrainingTab.setAttribute("aria-disabled", hasStudent ? "false" : "true");
        studentTrainingTab.title = hasStudent ? "" : "Primero guardá la ficha del alumno.";
      }

      const hash = window.location.hash;''',
        '''      if (studentTrainingTab) {
        studentTrainingTab.href = hasStudent ? `entrenamiento.html?id=${encodeURIComponent(studentId)}` : "#";
        studentTrainingTab.setAttribute("aria-disabled", hasStudent ? "false" : "true");
        studentTrainingTab.title = hasStudent ? "" : "Primero guardá la ficha del alumno.";
      }

      if (createTrainingPlanBtn) {
        createTrainingPlanBtn.href = hasStudent ? `entrenamiento.html?id=${encodeURIComponent(studentId)}` : "#";
        createTrainingPlanBtn.setAttribute("aria-disabled", hasStudent ? "false" : "true");
        createTrainingPlanBtn.title = hasStudent ? "" : "Primero guardá la ficha del alumno.";
      }

      const hash = window.location.hash;''',
        "training shortcut navigation",
        path,
    )

    text = replace_once(
        text,
        '''        const saved = await response.json();
        if (existing?.id) {
          allClasses = allClasses.map(item => String(item.id) === String(existing.id) ? { ...item, ...saved } : item);
        } else {
          allClasses.push(saved);
        }''',
        '''        const responseData = await response.json();
        const saved = existing?.id
          ? { ...existing, ...payload, ...responseData }
          : { ...payload, ...responseData };
        if (existing?.id) {
          allClasses = allClasses.map(item => String(item.id) === String(existing.id) ? saved : item);
        } else {
          allClasses.push(saved);
        }''',
        "robust appointment response merge",
        path,
    )

    text = replace_once(
        text,
        '''      selectedClass = found;
      activeBackendClassId = String(found.id);''',
        '''      if (isTrainingPage) {
        const selectedDate = parseISODate(found.class_date);
        if (selectedDate) calendarStartDate = startOfMonth(selectedDate);
      }

      selectedClass = found;
      activeBackendClassId = String(found.id);''',
        "show selected class month",
        path,
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
        "historical class metadata save",
        path,
    )

    text = replace_once(
        text,
        '''    if (addClassBtn) {
      addClassBtn.addEventListener("click", () => {
        if (isTrainingPage) return;
        openAppointmentModal(toISODate(startOfToday()), null);
      });
    }''',
        '''    if (addClassBtn) {
      addClassBtn.addEventListener("click", () => {
        if (isTrainingPage) return;
        const todayKey = toISODate(startOfToday());
        const existingToday = classesByDate().get(todayKey)?.[0] || null;
        openAppointmentModal(todayKey, existingToday);
      });
    }''',
        "avoid duplicate today appointment",
        path,
    )

    path.write_text(text, encoding="utf-8")

print("Applied appointment/training follow-up fixes")
