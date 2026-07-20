from __future__ import annotations

from pathlib import Path
import re

SOURCE = Path("admin/alumno.html")
TRAINING = Path("admin/entrenamiento.html")
MARKER = "yanina-appointment-training-v1"


def replace_exact(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Missing exact patch target: {label}")
    return text.replace(old, new, 1)


def replace_regex(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"Expected one regex patch target for {label}; found {count}")
    return updated


text = SOURCE.read_text(encoding="utf-8")

if MARKER not in text:
    text = replace_exact(text, "<body>", '<body class="student-record-page">', "record page body class")

    css = r'''

/* yanina-appointment-training-v1 */
.student-record-page #clase-seleccionada,
.student-record-page #plan > .routine-section-title,
.student-record-page #plan > #exerciseTable,
.student-record-page #historicalEditBox,
.student-record-page #plan > .workout-notes,
.student-record-page #classVideosAdmin,
.student-record-page #classCommentsAdmin,
.student-record-page #plan > .bottom-actions {
  display: none !important;
}

.training-page #datos,
.training-page #mediciones,
.training-page #calendario {
  display: none !important;
}

.training-page .calendar-save-actions,
.training-page .appointment-modal,
.student-record-page .training-time-field {
  display: none !important;
}

.training-page #plan {
  margin-top: 0;
}

.training-page #classDateInput[readonly],
.training-page #classTimeInput[readonly] {
  background: rgba(24, 63, 53, 0.06);
  color: var(--green-dark);
  cursor: default;
}

.timeline-day.is-empty {
  box-shadow: none;
}

.timeline-day.has-class {
  background: var(--green-soft);
  border-color: rgba(126, 200, 69, 0.72);
}

.timeline-day.has-class:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 22px rgba(24, 63, 53, 0.10);
}

.appointment-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 20px;
}

.appointment-modal[hidden] {
  display: none !important;
}

.appointment-modal-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(16, 35, 30, 0.58);
  backdrop-filter: blur(4px);
  cursor: default;
}

.appointment-dialog {
  position: relative;
  width: min(560px, 100%);
  max-height: calc(100vh - 40px);
  overflow: auto;
  background: var(--white);
  border: 1px solid rgba(24, 63, 53, 0.16);
  border-radius: 24px;
  padding: 22px;
  box-shadow: 0 28px 80px rgba(16, 35, 30, 0.30);
}

.appointment-dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.appointment-dialog-header h2 {
  color: var(--green-dark);
  font-size: 24px;
  line-height: 1.1;
}

.appointment-dialog-header p {
  color: var(--muted);
  font-size: 14px;
  line-height: 1.4;
  margin-top: 6px;
}

.appointment-close-btn {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--white);
  color: var(--green-dark);
  font-size: 22px;
  cursor: pointer;
}

.appointment-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.appointment-form-grid .field.full {
  grid-column: 1 / -1;
}

.appointment-form-grid input:disabled,
.appointment-form-grid textarea:disabled {
  opacity: 1;
  background: rgba(24, 63, 53, 0.06);
  color: var(--green-dark);
  cursor: default;
}

.appointment-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 18px;
}

.appointment-actions .delete-class-btn {
  margin-right: auto;
}

.appointment-status {
  min-height: 20px;
  margin-top: 12px;
  color: var(--green-dark);
  font-size: 13px;
  font-weight: 800;
}

body.appointment-modal-open {
  overflow: hidden;
}

@media (max-width: 560px) {
  .appointment-form-grid {
    grid-template-columns: 1fr;
  }

  .appointment-form-grid .field.full {
    grid-column: auto;
  }

  .appointment-dialog {
    padding: 18px;
    border-radius: 20px;
  }
}
'''
    text = replace_exact(text, "  </style>", css + "\n  </style>", "appointment styles")

    old_nav = '''      <a href="#datos" class="student-tab active">Datos del alumno</a>
      <a href="#calendario-mensual" class="student-tab">Calendario de clases</a>
      <a href="#clase-seleccionada" class="student-tab">Entrenamiento</a>
      <a href="#mediciones" class="student-tab">Hist. Mediciones</a>'''
    new_nav = '''      <a id="studentDataTab" href="#datos" class="student-tab active">Datos del alumno</a>
      <a id="studentCalendarTab" href="#calendario-mensual" class="student-tab">Calendario de clases</a>
      <a id="studentTrainingTab" href="entrenamiento.html" class="student-tab">Entrenamiento</a>
      <a id="studentMeasurementsTab" href="#mediciones" class="student-tab">Hist. Mediciones</a>'''
    text = replace_exact(text, old_nav, new_nav, "student navigation")

    text = replace_exact(
        text,
        '<input id="classDateInput" type="date" />',
        '<input id="classDateInput" type="date" readonly aria-readonly="true" />',
        "selected class readonly date",
    )
    text = replace_exact(
        text,
        '            <input id="classTimeInput" type="hidden" />',
        '''            <div class="field training-time-field">
              <label for="classTimeInput">Hora</label>
              <input id="classTimeInput" type="time" readonly aria-readonly="true" />
            </div>''',
        "selected class visible time",
    )

    text = replace_exact(
        text,
        '''              <h3>Calendario de clases mensuales</h3>
              <p>Click en un día para programar clase. El día seleccionado permite cargar o editar la hora dentro del calendario.</p>''',
        '''              <h3>Calendario de clases</h3>
              <p>Seleccioná una fecha para crear, editar o eliminar el turno. Las fechas guardadas aparecen en verde.</p>''',
        "calendar heading",
    )

    modal = r'''

    <div class="appointment-modal" id="appointmentModal" hidden>
      <button type="button" class="appointment-modal-backdrop" id="appointmentBackdrop" aria-label="Cerrar ventana"></button>
      <section class="appointment-dialog" role="dialog" aria-modal="true" aria-labelledby="appointmentTitle">
        <div class="appointment-dialog-header">
          <div>
            <h2 id="appointmentTitle">Nueva clase</h2>
            <p id="appointmentSubtitle">Completá la hora y los comentarios del turno.</p>
          </div>
          <button type="button" class="appointment-close-btn" id="appointmentCloseBtn" aria-label="Cerrar">×</button>
        </div>

        <div class="appointment-form-grid">
          <div class="field">
            <label for="appointmentDateInput">Fecha</label>
            <input id="appointmentDateInput" type="date" readonly aria-readonly="true" />
          </div>
          <div class="field">
            <label for="appointmentTimeInput">Hora</label>
            <input id="appointmentTimeInput" type="time" required />
          </div>
          <div class="field full">
            <label for="appointmentCommentsInput">Comentarios</label>
            <textarea id="appointmentCommentsInput" placeholder="Comentarios sobre el turno, indicaciones o aclaraciones."></textarea>
          </div>
        </div>

        <div class="appointment-actions">
          <button type="button" class="delete-class-btn" id="appointmentDeleteBtn" title="Eliminar clase" aria-label="Eliminar clase">E</button>
          <button type="button" class="btn btn-form-secondary" id="appointmentEditBtn">Editar</button>
          <button type="button" class="btn btn-form-primary" id="appointmentSaveBtn">Guardar</button>
          <button type="button" class="btn btn-form-secondary" id="appointmentCancelBtn">Cerrar</button>
        </div>
        <div class="appointment-status" id="appointmentStatus" aria-live="polite"></div>
      </section>
    </div>
'''
    text = replace_exact(text, "\n  <script>\n", modal + "\n  <script>\n", "appointment modal")

    js_mode = r'''
    const isTrainingPage = document.body.classList.contains("training-page");
    const studentDataTab = document.getElementById("studentDataTab");
    const studentCalendarTab = document.getElementById("studentCalendarTab");
    const studentTrainingTab = document.getElementById("studentTrainingTab");
    const studentMeasurementsTab = document.getElementById("studentMeasurementsTab");

    if (!isTrainingPage && targetClassId && !isNewStudent) {
      const sectionPart = targetSection ? `&section=${encodeURIComponent(targetSection)}` : "";
      window.location.replace(`entrenamiento.html?id=${encodeURIComponent(studentId)}&classId=${encodeURIComponent(targetClassId)}${sectionPart}`);
      throw new Error("TRAINING_PAGE_REDIRECT");
    }

    function updateStudentNavigationLinks() {
      const hasStudent = Boolean(studentId);
      const query = hasStudent ? `?id=${encodeURIComponent(studentId)}` : "?new=1";

      if (isTrainingPage) {
        if (studentDataTab) studentDataTab.href = `alumno.html${query}#datos`;
        if (studentCalendarTab) studentCalendarTab.href = `alumno.html${query}#calendario-mensual`;
        if (studentMeasurementsTab) studentMeasurementsTab.href = `alumno.html${query}#mediciones`;
      } else {
        if (studentDataTab) studentDataTab.href = "#datos";
        if (studentCalendarTab) studentCalendarTab.href = "#calendario-mensual";
        if (studentMeasurementsTab) studentMeasurementsTab.href = "#mediciones";
      }

      if (studentTrainingTab) {
        studentTrainingTab.href = hasStudent ? `entrenamiento.html?id=${encodeURIComponent(studentId)}` : "#";
        studentTrainingTab.setAttribute("aria-disabled", hasStudent ? "false" : "true");
        studentTrainingTab.title = hasStudent ? "" : "Primero guardá la ficha del alumno.";
      }

      const hash = window.location.hash;
      studentDataTab?.classList.toggle("active", !isTrainingPage && (!hash || hash === "#datos"));
      studentCalendarTab?.classList.toggle("active", !isTrainingPage && (hash === "#calendario" || hash === "#calendario-mensual" || hash === "#plan"));
      studentMeasurementsTab?.classList.toggle("active", !isTrainingPage && hash === "#mediciones");
      studentTrainingTab?.classList.toggle("active", isTrainingPage);
    }

    window.addEventListener("hashchange", updateStudentNavigationLinks);
'''
    text = replace_exact(
        text,
        "    const starfitMeasurementsTab = null;\n",
        "    const starfitMeasurementsTab = null;\n" + js_mode,
        "page mode and navigation JS",
    )

    new_month_select = r'''    function populateCalendarMonthSelect() {
      if (!calendarMonthSelect) return;

      const currentValue = monthKey(calendarStartDate);
      const base = startOfMonth(startOfToday());
      let firstMonth = addMonths(base, -60);
      let lastMonth = addMonths(base, 24);

      allClasses.filter(isMeaningfulClass).forEach(item => {
        const date = parseISODate(item.class_date);
        if (!date) return;
        const classMonth = startOfMonth(date);
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
    text = replace_regex(
        text,
        r"    function populateCalendarMonthSelect\(\) \{.*?\n    \}\n\n    function toISODate",
        new_month_select,
        "calendar month history range",
    )

    new_load_selection = r'''      const requestedClass = targetClassId
        ? allClasses.find(item => String(item.id) === String(targetClassId))
        : null;
      const meaningfulClasses = allClasses.filter(isMeaningfulClass);
      const todayKey = toISODate(startOfToday());
      const nextClass = meaningfulClasses.find(item => String(item.class_date || "") >= todayKey) || null;
      const pastClasses = meaningfulClasses.filter(item => String(item.class_date || "") < todayKey);
      const defaultTrainingClass = nextClass || pastClasses[pastClasses.length - 1] || meaningfulClasses[0] || null;

      if (isTrainingPage && requestedClass) {
        await selectClass(requestedClass.id, false);
        const target = targetSection === "videos"
          ? document.getElementById("classVideosAdmin")
          : targetSection === "comments"
            ? document.getElementById("classCommentsAdmin")
            : document.getElementById("clase-seleccionada");
        requestAnimationFrame(() => target?.scrollIntoView({ behavior: "smooth", block: "start" }));
      } else if (isTrainingPage && defaultTrainingClass && !selectedClass) {
        await selectClass(defaultTrainingClass.id, false);
      }

      return allClasses;'''
    text = replace_regex(
        text,
        r"      const requestedClass = targetClassId.*?\n      return allClasses;",
        new_load_selection,
        "training default class selection",
    )

    appointment_js = r'''
    let appointmentClass = null;
    let appointmentEditing = false;

    function appointmentElements() {
      return {
        modal: document.getElementById("appointmentModal"),
        title: document.getElementById("appointmentTitle"),
        subtitle: document.getElementById("appointmentSubtitle"),
        date: document.getElementById("appointmentDateInput"),
        time: document.getElementById("appointmentTimeInput"),
        comments: document.getElementById("appointmentCommentsInput"),
        save: document.getElementById("appointmentSaveBtn"),
        edit: document.getElementById("appointmentEditBtn"),
        remove: document.getElementById("appointmentDeleteBtn"),
        status: document.getElementById("appointmentStatus")
      };
    }

    function setAppointmentStatus(message = "") {
      const status = document.getElementById("appointmentStatus");
      if (status) status.textContent = message;
    }

    function setAppointmentEditing(editing) {
      const els = appointmentElements();
      appointmentEditing = Boolean(editing);
      const isSaved = Boolean(appointmentClass?.id);

      if (els.time) els.time.disabled = !appointmentEditing;
      if (els.comments) els.comments.disabled = !appointmentEditing;
      if (els.save) els.save.disabled = !appointmentEditing;
      if (els.edit) els.edit.disabled = !isSaved || appointmentEditing;
      if (els.remove) els.remove.disabled = !isSaved;

      if (appointmentEditing) {
        setAppointmentStatus(isSaved ? "Editando el turno. Guardá para aplicar los cambios." : "Completá la hora para guardar el turno.");
        requestAnimationFrame(() => els.time?.focus());
      } else {
        setAppointmentStatus(isSaved ? "Turno guardado." : "");
      }
    }

    function openAppointmentModal(dateKey, item = null) {
      if (isTrainingPage) return;
      const els = appointmentElements();
      if (!els.modal) return;

      appointmentClass = item ? { ...item } : null;
      if (els.date) els.date.value = dateKey || item?.class_date || "";
      if (els.time) els.time.value = normalizeTimeForInput(item?.class_time || "");
      if (els.comments) els.comments.value = item?.planning_criteria || "";
      if (els.title) els.title.textContent = item ? "Clase guardada" : "Nueva clase";
      if (els.subtitle) {
        els.subtitle.textContent = item
          ? "Usá Editar para cambiar la hora o los comentarios."
          : "Completá la hora y los comentarios del turno.";
      }

      els.modal.hidden = false;
      document.body.classList.add("appointment-modal-open");
      setAppointmentEditing(!item);
    }

    function closeAppointmentModal() {
      const modal = document.getElementById("appointmentModal");
      if (modal) modal.hidden = true;
      appointmentClass = null;
      appointmentEditing = false;
      document.body.classList.remove("appointment-modal-open");
      setAppointmentStatus("");
    }

    async function saveAppointment() {
      if (isTrainingPage) return;
      if (!studentId) {
        alert("Primero guardá la ficha del alumno.");
        return;
      }

      const els = appointmentElements();
      const classDate = String(els.date?.value || "").trim();
      const classTime = String(els.time?.value || "").trim();
      const comments = String(els.comments?.value || "").trim();

      if (!classDate) return;
      if (!classTime) {
        setAppointmentStatus("Ingresá la hora de la clase.");
        els.time?.focus();
        return;
      }

      const existing = appointmentClass;
      const payload = {
        class_date: classDate,
        class_time: classTime,
        routine_type: existing?.routine_type || "Clase",
        status: normalizeStatus(existing?.status) === "draft" ? "scheduled" : (existing?.status || "scheduled"),
        planning_criteria: comments
      };

      const originalText = els.save?.textContent || "Guardar";
      if (els.save) {
        els.save.disabled = true;
        els.save.textContent = "Guardando...";
      }

      try {
        const response = await fetch(
          existing?.id
            ? `${API_BASE}/api/classes/${encodeURIComponent(existing.id)}`
            : `${API_BASE}/api/students/${encodeURIComponent(studentId)}/classes`,
          {
            method: existing?.id ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "No se pudo guardar la clase.");
        }

        const saved = await response.json();
        if (existing?.id) {
          allClasses = allClasses.map(item => String(item.id) === String(existing.id) ? { ...item, ...saved } : item);
        } else {
          allClasses.push(saved);
        }
        allClasses.sort((a, b) => String(a.class_date || "").localeCompare(String(b.class_date || "")) || String(a.class_time || "").localeCompare(String(b.class_time || "")));

        appointmentClass = saved;
        if (selectedClass && String(selectedClass.id) === String(saved.id)) selectedClass = { ...selectedClass, ...saved };
        renderCalendarAndClasses();
        if (els.title) els.title.textContent = "Clase guardada";
        if (els.subtitle) els.subtitle.textContent = "Usá Editar para cambiar la hora o los comentarios.";
        setAppointmentEditing(false);
      } catch (error) {
        console.error(error);
        setAppointmentStatus(error.message || "No se pudo guardar la clase.");
      } finally {
        if (els.save) els.save.textContent = originalText;
        if (appointmentEditing && els.save) els.save.disabled = false;
      }
    }

    async function deleteAppointment() {
      const classId = appointmentClass?.id;
      if (!classId) return;
      try {
        await deleteClass(classId);
        closeAppointmentModal();
      } catch (error) {
        console.error(error);
        setAppointmentStatus(error.message || "No se pudo eliminar la clase.");
      }
    }

'''

    new_render_timeline = appointment_js + r'''    function renderTimeline() {
      if (!timelineGrid) return;

      const map = classesByDate();
      timelineGrid.innerHTML = "";

      const monthStart = startOfMonth(calendarStartDate);
      const monthEnd = addDays(addMonths(monthStart, 1), -1);
      const visibleStart = addDays(monthStart, -monthStart.getDay());
      const weekdays = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

      weekdays.forEach(day => {
        const header = document.createElement("div");
        header.className = "timeline-weekday";
        header.textContent = day;
        timelineGrid.appendChild(header);
      });

      if (calendarRangeLabel) {
        calendarRangeLabel.textContent = monthStart.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
      }

      populateCalendarMonthSelect();

      if (plannedCounter) {
        const savedInMonth = allClasses.filter(item => {
          if (!isMeaningfulClass(item)) return false;
          const date = parseISODate(item.class_date);
          return date && date >= monthStart && date <= monthEnd;
        });
        const savedCount = savedInMonth.length;
        plannedCounter.textContent = `${savedCount} ${savedCount === 1 ? "clase guardada" : "clases guardadas"}`;
      }

      for (let index = 0; index < 42; index++) {
        const date = addDays(visibleStart, index);
        const dateKey = toISODate(date);
        const isCurrentMonth = date.getMonth() === monthStart.getMonth();
        const label = formatDateShort(dateKey);
        const classesForDay = map.get(dateKey) || [];
        const firstClass = classesForDay[0] || null;
        const isActive = Boolean(firstClass && selectedClass && String(firstClass.id) === String(selectedClass.id));
        const canSelect = Boolean(isCurrentMonth && (firstClass || !isTrainingPage));
        const cell = document.createElement(canSelect ? "button" : "div");

        cell.className = "timeline-day";
        if (!isCurrentMonth) cell.classList.add("is-outside");
        if (isCurrentMonth && !firstClass) cell.classList.add("is-empty");
        if (firstClass) cell.classList.add("has-class");
        if (canSelect) cell.classList.add("is-selectable");
        if (isActive) cell.classList.add("is-active");
        if (firstClass && !firstClass.has_routine) cell.classList.add("no-routine");

        cell.innerHTML = `
          <span>${label.weekday}</span>
          <strong>${label.day}</strong>
          ${firstClass ? `
            <em>${escapeHtml(firstClass.class_time || "Sin hora")}</em>
            <small>${escapeHtml(firstClass.routine_type || "Clase")}</small>
            ${classesForDay.length > 1 ? `<small>${classesForDay.length} clases este día</small>` : ""}
          ` : `<small class="slot-action" aria-hidden="true"></small>`}
        `;

        if (canSelect) {
          cell.type = "button";
          cell.addEventListener("click", async () => {
            if (isTrainingPage) {
              if (firstClass) await selectClass(firstClass.id, false);
              return;
            }
            openAppointmentModal(dateKey, firstClass);
          });
        }

        timelineGrid.appendChild(cell);
      }
    }

    function renderClassList() {'''
    text = replace_regex(
        text,
        r"    function renderTimeline\(\) \{.*?\n    function renderClassList\(\) \{",
        new_render_timeline,
        "appointment calendar rendering",
    )

    text = replace_exact(
        text,
        '''      classList.querySelectorAll("[data-action='edit-class']").forEach(btn => {
        btn.addEventListener("click", () => selectClass(btn.dataset.id, true));
      });''',
        '''      classList.querySelectorAll("[data-action='edit-class']").forEach(btn => {
        btn.addEventListener("click", async () => {
          const item = allClasses.find(entry => String(entry.id) === String(btn.dataset.id));
          if (!item) return;
          if (isTrainingPage) await selectClass(item.id, true);
          else openAppointmentModal(item.class_date, item);
        });
      });''',
        "upcoming class edit action",
    )

    text = replace_exact(
        text,
        '''    if (addClassBtn) {
      addClassBtn.addEventListener("click", () => createClassForStudent(toISODate(startOfToday()), true));
    }''',
        '''    if (addClassBtn) {
      addClassBtn.addEventListener("click", () => {
        if (isTrainingPage) return;
        openAppointmentModal(toISODate(startOfToday()), null);
      });
    }''',
        "add class modal action",
    )

    text = replace_exact(
        text,
        '''        await loadStudentFromBackend();
        await loadMeasurementsFromBackend();
        await loadClassesFromBackend();''',
        '''        await loadStudentFromBackend();
        if (!isTrainingPage) await loadMeasurementsFromBackend();
        await loadClassesFromBackend();''',
        "training page loading scope",
    )

    text = replace_exact(
        text,
        '''        updateStudentIdentity();
        refreshNotificationBell();''',
        '''        updateStudentIdentity();
        updateStudentNavigationLinks();
        refreshNotificationBell();''',
        "initialize navigation links",
    )

    modal_events = r'''
    document.getElementById("appointmentSaveBtn")?.addEventListener("click", saveAppointment);
    document.getElementById("appointmentEditBtn")?.addEventListener("click", () => setAppointmentEditing(true));
    document.getElementById("appointmentDeleteBtn")?.addEventListener("click", deleteAppointment);
    document.getElementById("appointmentCloseBtn")?.addEventListener("click", closeAppointmentModal);
    document.getElementById("appointmentCancelBtn")?.addEventListener("click", closeAppointmentModal);
    document.getElementById("appointmentBackdrop")?.addEventListener("click", closeAppointmentModal);
    window.addEventListener("keydown", event => {
      if (event.key === "Escape" && !document.getElementById("appointmentModal")?.hidden) closeAppointmentModal();
    });

'''
    text = replace_exact(
        text,
        '    document.getElementById("saveAdminClassCommentBtn")?.addEventListener("click", saveAdminClassComment);\n\n    initializeStudentPage();',
        '    document.getElementById("saveAdminClassCommentBtn")?.addEventListener("click", saveAdminClassComment);\n' + modal_events + '    initializeStudentPage();',
        "appointment modal events",
    )

    SOURCE.write_text(text, encoding="utf-8")

# Always regenerate the separate training page from the patched source so both pages stay aligned.
record_text = SOURCE.read_text(encoding="utf-8")
training_text = record_text
training_text = replace_exact(training_text, '<body class="student-record-page">', '<body class="training-page">', "training body class")
training_text = replace_exact(training_text, '<title>Ficha del Alumno | Yanina Trainer</title>', '<title>Entrenamiento | Yanina Trainer</title>', "training title")
training_text = replace_exact(training_text, '<small>Ficha del alumno</small>', '<small>Entrenamiento</small>', "training topbar label")
training_text = replace_exact(training_text, '<h1>Ficha del alumno</h1>', '<h1>Entrenamiento</h1>', "training h1")
training_text = replace_regex(
    training_text,
    r'      <p class="subtitle">\s*Gestioná los datos, el calendario y el plan de entrenamiento de cada alumno desde acá\.\s*</p>',
    '''      <p class="subtitle">
        Elegí una fecha guardada en verde para cargar o revisar la clase, la rutina, las observaciones, los comentarios y los videos.
      </p>''',
    "training subtitle",
)
training_text = replace_exact(training_text, 'id="studentDataTab" href="#datos" class="student-tab active"', 'id="studentDataTab" href="#datos" class="student-tab"', "training inactive data tab")
training_text = replace_exact(training_text, 'id="studentTrainingTab" href="entrenamiento.html" class="student-tab"', 'id="studentTrainingTab" href="entrenamiento.html" class="student-tab active"', "training active tab")
training_text = replace_exact(training_text, '<h3>Calendario de clases</h3>', '<h3>Calendario de entrenamientos</h3>', "training calendar title")
training_text = replace_exact(
    training_text,
    '<p>Seleccioná una fecha para crear, editar o eliminar el turno. Las fechas guardadas aparecen en verde.</p>',
    '<p>Seleccioná una fecha verde para cargar o consultar el entrenamiento. También podés navegar a meses anteriores.</p>',
    "training calendar instructions",
)
training_text = replace_exact(training_text, '<h3>Clase seleccionada</h3>', '<h3>Clase y rutina seleccionada</h3>', "training selected class heading")
training_text = replace_exact(training_text, '>Guardar rutina</button>', '>Guardar clase y rutina</button>', "training save button")

TRAINING.write_text(training_text, encoding="utf-8")

# Structural safeguards.
for path in (SOURCE, TRAINING):
    data = path.read_text(encoding="utf-8")
    required = [
        MARKER,
        'id="studentTrainingTab"',
        'id="appointmentModal"',
        'function saveAppointment()',
        'function renderTimeline()',
        'id="classVideosAdmin"',
        'id="classCommentsAdmin"',
        'id="saveWorkoutBtn"',
    ]
    missing = [item for item in required if item not in data]
    if missing:
        raise RuntimeError(f"{path}: missing required markers: {missing}")
    if data.count('<script>') != data.count('</script>'):
        raise RuntimeError(f"{path}: unbalanced script tags")
    if data.count('<style>') != data.count('</style>'):
        raise RuntimeError(f"{path}: unbalanced style tags")

print("Patched admin/alumno.html and generated admin/entrenamiento.html")
