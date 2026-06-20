(() => {
  let editedExerciseFields = new Map();

  function mergeHistoricalEdits(edits) {
    const result = { technicalNotes: false, exercises: new Map() };
    (Array.isArray(edits) ? edits : []).forEach(edit => {
      const changes = edit?.changes || {};
      if (changes.technical_notes) result.technicalNotes = true;
      (changes.exercises || []).forEach(change => {
        if (change.kind === "removed") return;
        const fields = result.exercises.get(Number(change.index)) || new Set();
        (change.fields || []).forEach(field => fields.add(field));
        result.exercises.set(Number(change.index), fields);
      });
    });
    return result;
  }

  function ensureHistoryBox() {
    let box = document.getElementById("routineEditHistory");
    if (box) return box;
    box = document.createElement("div");
    box.id = "routineEditHistory";
    box.className = "routine-edit-history";
    box.hidden = true;
    document.getElementById("routineList")?.insertAdjacentElement("afterend", box);
    return box;
  }

  function renderEditHistory(edits) {
    const box = ensureHistoryBox();
    const items = Array.isArray(edits) ? edits : [];
    box.hidden = !items.length;
    box.innerHTML = items.length
      ? `<strong>Ediciones posteriores a la clase</strong>${items.map(item => `<p>TRAINER: ${esc(item.edit_comment || "")}</p>`).join("")}`
      : "";
  }

  const originalLoadRoutine = loadRoutine;
  loadRoutine = async function loadRoutineWithHistory(classId) {
    const data = await originalLoadRoutine(classId);
    const edits = Array.isArray(data.historical_edits) ? data.historical_edits : [];
    const merged = mergeHistoricalEdits(edits);
    editedExerciseFields = merged.exercises;
    renderEditHistory(edits);
    document.getElementById("routineNotes")?.classList.toggle("routine-edit-field", merged.technicalNotes);
    return data;
  };

  renderRoutineRow = function renderRoutineRowWithHistory(exercise, index) {
    const fields = editedExerciseFields.get(Number(index)) || new Set();
    const fieldClass = field => fields.has(field) ? "routine-edit-field" : "";
    return `<article class="routine-table-row"><strong class="${fieldClass("exercise_name")}">${esc(exercise.exercise_name || "Ejercicio")}</strong><span class="${fieldClass("sets")}">${esc(exercise.sets || "—")} series</span><span class="${fieldClass("reps_time")}">${esc(exercise.reps_time || "—")}</span><span class="${fieldClass("load")}">${esc(exercise.load || "sin carga")}</span><button type="button" class="routine-view-btn" data-view-exercise="${index}" aria-expanded="false">Ver</button></article>`;
  };
})();
