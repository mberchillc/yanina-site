from __future__ import annotations

from pathlib import Path

ALUMNO = Path("admin/alumno.html")
TRAINING = Path("admin/entrenamiento.html")
MARKER = "YANINA_APPOINTMENT_TRAINING_FINAL_V4"


def replace_once(text: str, old: str, new: str, label: str, path: Path) -> str:
    if old not in text:
        raise RuntimeError(f"{path}: missing exact target for {label}")
    return text.replace(old, new, 1)


def add_marker(text: str, path: Path) -> str:
    return replace_once(
        text,
        "    /* YANINA_APPOINTMENT_TRAINING_FOLLOWUP_V3 */",
        "    /* YANINA_APPOINTMENT_TRAINING_FOLLOWUP_V3 */\n"
        f"    /* {MARKER} */",
        "final marker",
        path,
    )


text = ALUMNO.read_text(encoding="utf-8")
if MARKER not in text:
    text = replace_once(
        text,
        '''    async function saveAppointment() {
      const classDate = appointmentDateInput.value, classTime = appointmentTimeInput.value, comments = appointmentCommentsInput.value || "";''',
        '''    async function saveAppointment() {
      if (!studentId) {
        showAppointmentState("Primero guardá la ficha del alumno para crear una cita.", true);
        return;
      }
      const classDate = appointmentDateInput.value, classTime = appointmentTimeInput.value, comments = appointmentCommentsInput.value || "";''',
        "unsaved student appointment guard",
        ALUMNO,
    )

    text = replace_once(
        text,
        '''        const responseData = await response.json();
        const saved = { ...previous, ...payload, ...responseData };
        if (!saved.id && appointmentClassId) saved.id = appointmentClassId;
        if (!saved.id) throw new Error("La cita se guardó, pero la API no devolvió su identificador.");''',
        '''        const responseData = await response.json();
        const returnedClass = responseData?.class || responseData?.appointment || responseData;
        const saved = { ...previous, ...payload, ...returnedClass };
        if (!saved.id) saved.id = responseData?.class_id || responseData?.appointment_id || appointmentClassId;
        if (!saved.id) throw new Error("La cita se guardó, pero la API no devolvió su identificador.");''',
        "robust appointment response shape",
        ALUMNO,
    )

    text = add_marker(text, ALUMNO)
    ALUMNO.write_text(text, encoding="utf-8")


text = TRAINING.read_text(encoding="utf-8")
if MARKER not in text:
    text = replace_once(
        text,
        "          <small>Ficha del alumno</small>",
        "          <small>Entrenamiento</small>",
        "training topbar label",
        TRAINING,
    )

    text = replace_once(
        text,
        '''      const defaultClass = nextClass || pastClasses[pastClasses.length - 1] || meaningfulClasses[0] || null;
      const classToOpen = requestedClass || defaultClass;''',
        '''      const defaultClass = nextClass || pastClasses[pastClasses.length - 1] || meaningfulClasses[0] || null;
      const currentClass = selectedClass?.id
        ? allClasses.find(item => String(item.id) === String(selectedClass.id)) || null
        : null;
      const classToOpen = requestedClass || currentClass || defaultClass;''',
        "preserve selected training class after reload",
        TRAINING,
    )

    text = replace_once(
        text,
        '''      if (!response.ok) {
        historicalRoutineEdits = [];
        loadedRoutineSnapshot = null;
        clearExerciseRows();
        addBlankExerciseRow();
        return;
      }''',
        '''      if (!response.ok) {
        historicalRoutineEdits = [];
        document.getElementById("notas-rutina").value = "";
        clearExerciseRows();
        addBlankExerciseRow();
        loadedRoutineSnapshot = currentRoutineSnapshot();
        updateRoutineEditState();
        return;
      }''',
        "empty routine editable baseline",
        TRAINING,
    )

    text = add_marker(text, TRAINING)
    TRAINING.write_text(text, encoding="utf-8")


for path in (ALUMNO, TRAINING):
    data = path.read_text(encoding="utf-8")
    if MARKER not in data:
        raise RuntimeError(f"{path}: final marker was not written")

print("Applied final appointment and training safeguards")
