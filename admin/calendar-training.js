(() => {
  const pageMode = document.body.dataset.page || "calendar";
  const isCalendarPage = pageMode === "calendar";
  const isTrainingPage = pageMode === "training";

  const originalSelectClass = selectClass;
  const originalDeleteClass = deleteClass;

  function classTrainingUrl(classId = "") {
    const search = new URLSearchParams();
    if (studentId) search.set("id", studentId);
    if (classId) search.set("classId", classId);
    return `entrenamiento.html?${search.toString()}`;
  }

  function updateNavigation() {
    const links = [...document.querySelectorAll(".student-tab")].filter(node => node.tagName === "A");
    const byText = label => links.find(link => link.textContent.trim() === label);
    const dataLink = byText("Datos del alumno");
    const calendarLink = byText("Calendario de clases");
    const trainingLink = byText("Entrenamiento");
    const measurementsLink = byText("Hist. Mediciones");
    const idQuery = studentId ? `?id=${encodeURIComponent(studentId)}` : "?new=1";

    links.forEach(link => link.classList.remove("active"));

    if (isTrainingPage) {
      if (dataLink) dataLink.href = `alumno.html${idQuery}#datos`;
      if (calendarLink) calendarLink.href = `alumno.html${idQuery}#calendario-mensual`;
      if (trainingLink) {
        trainingLink.href = `entrenamiento.html${idQuery}`;
        trainingLink.classList.add("active");
      }
      if (measurementsLink) measurementsLink.href = `alumno.html${idQuery}#mediciones`;
    } else {
      if (dataLink) dataLink.href = "#datos";
      if (calendarLink) {
        calendarLink.href = "#calendario-mensual";
        calendarLink.classList.add("active");
      }
      if (trainingLink) trainingLink.href = studentId ? `entrenamiento.html${idQuery}` : "#";
      if (measurementsLink) measurementsLink.href = "#mediciones";
    }

    const createPlanLink = [...document.querySelectorAll("a.btn")]
      .find(link => link.textContent.trim() === "Crear plan de entrenamiento");
    if (createPlanLink) createPlanLink.href = studentId ? `entrenamiento.html${idQuery}` : "#";
  }

  function configurePageCopy() {
    if (isCalendarPage) {
      const upcomingTitle = document.querySelector("#calendario .card-title");
      const upcomingHelp = document.querySelector("#calendario .card-subtitle");
      const calendarTitle = document.querySelector("#calendario-mensual h3");
      const calendarHelp = document.querySelector("#calendario-mensual .plan-timeline-header p");
      if (upcomingTitle) upcomingTitle.textContent = "Próximas citas";
      if (upcomingHelp) upcomingHelp.textContent = "Citas guardadas para la alumna. Desde acá podés editarlas, eliminarlas o abrir su entrenamiento.";
      if (calendarTitle) calendarTitle.textContent = "Calendario de citas";
      if (calendarHelp) calendarHelp.textContent = "Tocá cualquier fecha para crear, ver, editar o eliminar una cita.";
      if (saveClassBtn) saveClassBtn.hidden = true;
    }

    if (isTrainingPage) {
      document.title = "Entrenamiento | Yanina Trainer";
      const brandSmall = document.querySelector(".brand-text small");
      if (brandSmall) brandSmall.textContent = "Entrenamiento del alumno";
      const heading = document.querySelector(".page-header h1");
      if (heading) heading.textContent = "Entrenamiento";
      const subtitle = document.querySelector(".page-header .subtitle");
      if (subtitle) subtitle.textContent = "Seleccioná una cita guardada para crear, revisar o editar la clase, la rutina, los comentarios y los videos vinculados.";
      const calendarTitle = document.querySelector("#calendario-mensual h3");
      if (calendarTitle) calendarTitle.textContent = "Elegir clase";
      const calendarHelp = document.querySelector("#calendario-mensual .plan-timeline-header p");
      if (calendarHelp) calendarHelp.textContent = "Las fechas verdes tienen una cita guardada. Seleccioná una para abrir toda la actividad de esa clase.";
      const dateField = document.getElementById("classDateInput");
      const dateLabel = document.querySelector('label[for="classDateInput"]');
      if (dateField) dateField.readOnly = true;
      if (dateLabel) dateLabel.textContent = "Fecha de la cita";
      const criteriaLabel = document.querySelector('label[for="classCriteriaInput"]');
      if (criteriaLabel) criteriaLabel.textContent = "Comentarios / criterio de planificación";
      if (workoutSaveButton) workoutSaveButton.textContent = "Guardar clase y rutina";

      if (!document.getElementById("trainingSelectionHint")) {
        const hint = document.createElement("div");
        hint.id = "trainingSelectionHint";
        hint.className = "empty-state training-selection-hint";
        hint.textContent = "Seleccioná una fecha verde del calendario para abrir la clase y su rutina.";
        document.getElementById("clase-seleccionada")?.before(hint);
      }
    }

    updateNavigation();
  }

  if (isCalendarPage && targetClassId) {
    const redirect = new URLSearchParams();
    if (studentId) redirect.set("id", studentId);
    redirect.set("classId", targetClassId);
    if (targetSection) redirect.set("section", targetSection);
    window.location.replace(`entrenamiento.html?${redirect.toString()}`);
    return;
  }

  const modal = document.createElement("div");
  modal.className = "appointment-modal";
  modal.id = "appointmentModal";
  modal.hidden = true;
  modal.innerHTML = `
    <section class="appointment-dialog" role="dialog" aria-modal="true" aria-labelledby="appointmentModalTitle">
      <div class="appointment-dialog-header">
        <div>
          <h2 id="appointmentModalTitle">Cita</h2>
          <p>Programá la fecha y hora de la clase. Una cita guardada queda marcada en verde.</p>
        </div>
        <button type="button" class="appointment-close-btn" data-appointment-close aria-label="Cerrar">×</button>
      </div>
      <div class="appointment-form-grid">
        <div class="field">
          <label for="appointmentDateInput">Fecha</label>
          <input id="appointmentDateInput" type="date" readonly />
        </div>
        <div class="field">
          <label for="appointmentTimeInput">Hora (hh:mm)</label>
          <input id="appointmentTimeInput" type="time" step="60" />
        </div>
        <div class="field full">
          <label for="appointmentCommentsInput">Comentarios</label>
          <textarea id="appointmentCommentsInput" placeholder="Comentarios sobre la cita o indicaciones previas."></textarea>
        </div>
      </div>
      <div class="appointment-modal-actions">
        <button type="button" class="delete-class-btn" id="deleteAppointmentBtn" title="Eliminar cita" aria-label="Eliminar cita">E</button>
        <button type="button" class="btn btn-form-secondary" id="editAppointmentBtn">Editar</button>
        <button type="button" class="btn btn-form-primary" id="saveAppointmentBtn">Guardar</button>
      </div>
      <div class="appointment-modal-status" id="appointmentModalStatus" aria-live="polite"></div>
    </section>
  `;
  document.body.appendChild(modal);

  const appointmentDateInput = modal.querySelector("#appointmentDateInput");
  const appointmentTimeInput = modal.querySelector("#appointmentTimeInput");
  const appointmentCommentsInput = modal.querySelector("#appointmentCommentsInput");
  const appointmentStatus = modal.querySelector("#appointmentModalStatus");
  const deleteAppointmentButton = modal.querySelector("#deleteAppointmentBtn");
  const editAppointmentButton = modal.querySelector("#editAppointmentBtn");
  const saveAppointmentButton = modal.querySelector("#saveAppointmentBtn");
  let modalClass = null;

  function setAppointmentStatus(message = "", kind = "") {
    appointmentStatus.textContent = message;
    appointmentStatus.classList.toggle("is-error", kind === "error");
    appointmentStatus.classList.toggle("is-success", kind === "success");
  }

  function setAppointmentEditable(editable) {
    appointmentTimeInput.disabled = !editable;
    appointmentCommentsInput.disabled = !editable;
    saveAppointmentButton.disabled = !editable;
    editAppointmentButton.disabled = editable || !modalClass?.id;
  }

  function openAppointmentModal(dateKey, item = null) {
    if (!isCalendarPage) return;
    modalClass = item ? { ...item } : null;
    appointmentDateInput.value = dateKey || item?.class_date || "";
    appointmentTimeInput.value = normalizeTimeForInput(item?.class_time || "");
    appointmentCommentsInput.value = item?.planning_criteria || "";
    deleteAppointmentButton.hidden = !item?.id;
    setAppointmentEditable(!item?.id);
    setAppointmentStatus(item?.id ? "Cita guardada. Tocá Editar para modificarla." : "Completá la hora y guardá la cita.");
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => (item?.id ? editAppointmentButton : appointmentTimeInput).focus());
  }

  function closeAppointmentModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
    modalClass = null;
    setAppointmentStatus("");
  }

  async function saveAppointment() {
    if (!studentId) throw new Error("Primero guardá la ficha del alumno.");

    const classDate = appointmentDateInput.value;
    const classTime = normalizeTimeForInput(appointmentTimeInput.value);
    const comments = appointmentCommentsInput.value.trim();

    if (!classDate) throw new Error("La cita necesita una fecha.");
    if (!/^\d{2}:\d{2}$/.test(classTime)) throw new Error("Ingresá la hora de la cita en formato hh:mm.");

    const payload = {
      class_date: classDate,
      class_time: classTime,
      routine_type: modalClass?.routine_type || "Clase",
      status: normalizeStatus(modalClass?.status) === "draft" ? "scheduled" : (modalClass?.status || "scheduled"),
      planning_criteria: comments
    };
    const url = modalClass?.id
      ? `${API_BASE}/api/classes/${encodeURIComponent(modalClass.id)}`
      : `${API_BASE}/api/students/${encodeURIComponent(studentId)}/classes`;

    setAppointmentStatus("Guardando...");
    saveAppointmentButton.disabled = true;
    editAppointmentButton.disabled = true;

    const response = await fetch(url, {
      method: modalClass?.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "No se pudo guardar la cita.");
    }

    const saved = await response.json();
    const savedClass = { ...modalClass, ...payload, ...saved };
    if (modalClass?.id) {
      allClasses = allClasses.map(item => String(item.id) === String(modalClass.id) ? savedClass : item);
    } else {
      allClasses.push(savedClass);
    }
    allClasses.sort((a, b) => String(a.class_date || "").localeCompare(String(b.class_date || "")) || String(a.class_time || "").localeCompare(String(b.class_time || "")));
    modalClass = savedClass;
    deleteAppointmentButton.hidden = false;
    renderCalendarAndClasses();
    setAppointmentEditable(false);
    setAppointmentStatus("Cita guardada. La fecha quedó marcada en verde.", "success");
  }

  populateCalendarMonthSelect = function populateCalendarMonthSelectOverride() {
    if (!calendarMonthSelect) return;
    const currentValue = monthKey(calendarStartDate);
    const base = startOfMonth(startOfToday());
    const months = new Map();

    for (let offset = -24; offset <= 12; offset++) {
      const date = addMonths(base, offset);
      months.set(monthKey(date), date);
    }
    allClasses.forEach(item => {
      const date = parseISODate(item.class_date);
      if (date) months.set(monthKey(date), startOfMonth(date));
    });
    months.set(currentValue, startOfMonth(calendarStartDate));

    calendarMonthSelect.innerHTML = [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([value, date]) => {
        const label = date.toLocaleDateString("es-US", { month: "long", year: "numeric" });
        return `<option value="${value}" ${value === currentValue ? "selected" : ""}>${label}</option>`;
      })
      .join("");
  };

  renderTimeline = function renderTimelineOverride() {
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
      calendarRangeLabel.textContent = monthStart.toLocaleDateString("es-US", { month: "long", year: "numeric" });
    }
    populateCalendarMonthSelect();

    if (plannedCounter) {
      const savedCount = allClasses.filter(item => {
        if (!isMeaningfulClass(item)) return false;
        const date = parseISODate(item.class_date);
        return date && date >= monthStart && date <= monthEnd;
      }).length;
      plannedCounter.textContent = `${savedCount} ${savedCount === 1 ? "cita guardada" : "citas guardadas"}`;
    }

    for (let index = 0; index < 42; index++) {
      const date = addDays(visibleStart, index);
      const dateKey = toISODate(date);
      const isCurrentMonth = date.getMonth() === monthStart.getMonth();
      const label = formatDateShort(dateKey);
      const classesForDay = map.get(dateKey) || [];
      const firstClass = classesForDay[0];
      const isActive = Boolean(firstClass && selectedClass && Number(firstClass.id) === Number(selectedClass.id));
      const isClickable = isCurrentMonth && (isCalendarPage || Boolean(firstClass));
      const cell = document.createElement(isClickable ? "button" : "div");

      cell.className = "timeline-day";
      if (!isCurrentMonth) cell.classList.add("is-outside");
      if (!firstClass) cell.classList.add("is-empty");
      if (firstClass) cell.classList.add("has-class");
      if (isClickable) cell.classList.add("is-selectable");
      if (isActive) cell.classList.add("is-active");
      if (firstClass && !firstClass.has_routine) cell.classList.add("no-routine");

      const detail = firstClass
        ? (firstClass.planning_criteria || (firstClass.has_routine ? firstClass.routine_type : "Cita guardada"))
        : "";
      cell.innerHTML = `
        <span>${label.weekday}</span>
        <strong>${label.day}</strong>
        ${firstClass ? `
          <em>${escapeHtml(firstClass.class_time || "Sin hora")}</em>
          <small>${escapeHtml(detail || "Cita guardada")}</small>
          ${classesForDay.length > 1 ? `<small>${classesForDay.length} citas este día</small>` : ""}
        ` : isCurrentMonth && isCalendarPage ? `<small class="slot-action">Agregar cita</small>` : `<small></small>`}
      `;

      if (isClickable) {
        cell.type = "button";
        cell.addEventListener("click", async () => {
          if (isCalendarPage) {
            openAppointmentModal(dateKey, firstClass || null);
          } else if (firstClass) {
            await selectClass(firstClass.id, true);
          }
        });
      }
      timelineGrid.appendChild(cell);
    }
  };

  renderClassList = function renderClassListOverride() {
    if (!classList) return;
    const todayKey = toISODate(startOfToday());
    const visibleClasses = allClasses
      .filter(item => isMeaningfulClass(item) && String(item.class_date || "") >= todayKey)
      .sort((a, b) => String(a.class_date || "").localeCompare(String(b.class_date || "")) || String(a.class_time || "").localeCompare(String(b.class_time || "")))
      .slice(0, 6);

    if (!visibleClasses.length) {
      classList.innerHTML = '<div class="empty-state">Todavía no hay próximas citas guardadas. Elegí un día del calendario para programar la primera.</div>';
      return;
    }

    classList.innerHTML = visibleClasses.map(item => {
      const label = formatDateShort(item.class_date);
      const state = getClassState(item);
      return `
        <article class="class-item">
          <div class="class-date"><strong>${escapeHtml(label.weekday)}</strong><span>${escapeHtml(label.day)}</span></div>
          <div class="class-info">
            <div class="class-topline">
              <strong>${escapeHtml(item.class_time || "Sin hora")}</strong>
              <span class="status-pill ${state.className}">${state.label}</span>
            </div>
            <p><strong>Comentarios:</strong> ${escapeHtml(item.planning_criteria || "Sin comentarios.")}</p>
            <p><strong>Fecha:</strong> ${escapeHtml(formatDateReadable(item.class_date))}</p>
            <div class="class-actions">
              <button type="button" class="btn btn-form-secondary" data-edit-appointment="${item.id}">Editar cita</button>
              <a class="btn btn-form-primary" href="${classTrainingUrl(item.id)}">Entrenamiento</a>
              <button type="button" class="btn btn-form-secondary" data-delete-appointment="${item.id}">Eliminar</button>
              ${item.has_routine ? `<a class="btn btn-primary" href="rutina-pdf.html?classId=${item.id}" target="_blank">Descargar rutina PDF</a>` : ""}
            </div>
          </div>
        </article>
      `;
    }).join("");

    classList.querySelectorAll("[data-edit-appointment]").forEach(button => {
      button.addEventListener("click", () => {
        const item = allClasses.find(entry => String(entry.id) === button.dataset.editAppointment);
        if (item) openAppointmentModal(item.class_date, item);
      });
    });
    classList.querySelectorAll("[data-delete-appointment]").forEach(button => {
      button.addEventListener("click", async () => {
        try {
          await deleteClass(button.dataset.deleteAppointment);
        } catch (error) {
          console.error(error);
          alert(error.message || "No se pudo eliminar la cita.");
        }
      });
    });
  };

  loadClassesFromBackend = async function loadClassesFromBackendOverride() {
    if (!studentId) return [];
    const response = await fetch(`${API_BASE}/api/students/${studentId}/classes?cache=${Date.now()}`);
    if (!response.ok) throw new Error("No se pudieron cargar las clases del alumno");

    const data = await response.json();
    allClasses = Array.isArray(data) ? data : [];
    allClasses.sort((a, b) => String(a.class_date || "").localeCompare(String(b.class_date || "")) || String(a.class_time || "").localeCompare(String(b.class_time || "")));
    renderCalendarAndClasses();

    if (isTrainingPage) {
      const requested = targetClassId ? allClasses.find(item => String(item.id) === String(targetClassId)) : null;
      const current = activeBackendClassId
        ? allClasses.find(item => String(item.id) === String(activeBackendClassId))
        : null;
      const classToOpen = requested || current;
      if (classToOpen) {
        await selectClass(classToOpen.id, false);
        const target = targetSection === "videos"
          ? document.getElementById("classVideosAdmin")
          : targetSection === "comments"
            ? document.getElementById("classCommentsAdmin")
            : document.getElementById("clase-seleccionada");
        if (requested) requestAnimationFrame(() => target?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    }
    updateNavigation();
    return allClasses;
  };

  selectClass = async function selectClassOverride(classId, shouldScroll) {
    const result = await originalSelectClass(classId, shouldScroll);
    const hint = document.getElementById("trainingSelectionHint");
    if (hint) hint.hidden = true;
    return result;
  };

  deleteClass = async function deleteClassOverride(classId) {
    const wasActive = String(activeBackendClassId || "") === String(classId || "");
    const result = await originalDeleteClass(classId);
    if (isTrainingPage && (wasActive || !selectedClass)) {
      const hint = document.getElementById("trainingSelectionHint");
      if (hint) hint.hidden = false;
    }
    return result;
  };

  saveClassAndRoutine = async function saveClassAndRoutineOverride() {
    const hasExistingRoutine = Boolean(loadedRoutineSnapshot);
    const historicalEdit = isClassStarted() && hasExistingRoutine;
    const classMetadataChanged = Boolean(activeBackendClassId && dirtyClassIds.has(String(activeBackendClassId)));
    const changed = hasExistingRoutine ? (routineIsDirty() || classMetadataChanged) : true;
    const editComment = String(historicalEditComment?.value || "").trim();

    if (historicalEdit && !changed) return { unchanged: true };
    if (historicalEdit && !editComment) {
      historicalEditBox?.classList.add("is-visible");
      historicalEditComment?.focus();
      throw new Error("Agregá un comentario sobre la edición antes de guardar la rutina.");
    }

    const savedClass = await saveCalendarChanges();
    const classId = savedClass?.id || activeBackendClassId;
    if (!classId) throw new Error("Primero guardá la cita en el calendario.");

    activeBackendClassId = String(classId);
    const payload = {
      routine_type: document.getElementById("classRoutineInput").value || "",
      technical_notes: document.getElementById("notas-rutina").value || "",
      student_message: "",
      edit_comment: historicalEdit ? editComment : "",
      exercises: collectExercises()
    };

    const response = await fetch(`${API_BASE}/api/classes/${activeBackendClassId}/routine`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "No se pudo guardar la rutina en D1");
    }

    const savedRoutine = await response.json();
    await loadClassesFromBackend();
    await loadRoutineFromBackend(activeBackendClassId);
    if (historicalEdit) await renderAdminClassComments(activeBackendClassId);
    return savedRoutine;
  };

  const addAppointmentButton = isCalendarPage ? addClassBtn?.cloneNode(true) : null;
  if (addClassBtn && addAppointmentButton) {
    addClassBtn.replaceWith(addAppointmentButton);
    addAppointmentButton.textContent = "+ Agregar cita";
    addAppointmentButton.addEventListener("click", () => {
      const today = toISODate(startOfToday());
      openAppointmentModal(today, classesByDate().get(today)?.[0] || null);
    });
  }

  modal.querySelector("[data-appointment-close]").addEventListener("click", closeAppointmentModal);
  editAppointmentButton.addEventListener("click", () => {
    setAppointmentEditable(true);
    setAppointmentStatus("Editá la hora o los comentarios y volvé a guardar.");
    appointmentTimeInput.focus();
  });
  saveAppointmentButton.addEventListener("click", async () => {
    try {
      await saveAppointment();
    } catch (error) {
      console.error(error);
      setAppointmentStatus(error.message || "No se pudo guardar la cita.", "error");
      setAppointmentEditable(true);
    }
  });
  deleteAppointmentButton.addEventListener("click", async () => {
    if (!modalClass?.id) return;
    try {
      await deleteClass(modalClass.id);
      closeAppointmentModal();
    } catch (error) {
      console.error(error);
      setAppointmentStatus(error.message || "No se pudo eliminar la cita.", "error");
    }
  });
  modal.addEventListener("click", event => {
    if (event.target === modal) closeAppointmentModal();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !modal.hidden) closeAppointmentModal();
  });

  configurePageCopy();

  if (isTrainingPage && !targetClassId && selectedClass) {
    selectedClass = null;
    activeBackendClassId = null;
    document.getElementById("classDateInput").value = "";
    document.getElementById("classTimeInput").value = "";
    document.getElementById("classRoutineInput").value = "";
    document.getElementById("classCriteriaInput").value = "";
    document.getElementById("notas-rutina").value = "";
    clearExerciseRows();
    addBlankExerciseRow();
    renderAdminClassVideos(null);
    renderAdminClassComments(null);
  }

  renderCalendarAndClasses();
  updateNavigation();
})();
