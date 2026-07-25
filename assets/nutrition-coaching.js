(function () {
  "use strict";

  const API_BASE = "https://yanina-trainer-api.mberchillc.workers.dev";
  const ROLE = document.body.dataset.nutritionRole === "admin" ? "admin" : "student";
  const params = new URLSearchParams(window.location.search);
  const sessionKey = ROLE === "admin" ? "yaninaAdminSession" : "yaninaStudentSession";
  const session = JSON.parse(localStorage.getItem(sessionKey) || "{}");
  const studentId = String(params.get("id") || params.get("studentId") || session.studentId || "");
  const app = document.getElementById("nutritionApp");
  const photoCache = new Map();
  const MEAL_TYPES = [
    ["breakfast", "Desayuno"],
    ["lunch", "Almuerzo"],
    ["snack", "Merienda"],
    ["dinner", "Cena"]
  ];
  const REVIEW_LABELS = {
    pending: "Pendiente",
    good: "Bien",
    review: "Revisar",
    no_comment: "Sin comentario"
  };

  const state = {
    weekStart: startOfWeek(todayIso()),
    selectedDate: todayIso(),
    data: null,
    selectedMealId: null,
    adminDayFilter: null,
    reviewStatus: "pending",
    reviewComment: null,
    composerOpen: false,
    composerMealType: null,
    message: "",
    messageKind: "",
    messageScope: ""
  };

  if (!session.token || (ROLE === "student" && !session.studentId)) {
    localStorage.removeItem(sessionKey);
    window.location.href = "/login.html";
    return;
  }

  if (!studentId) {
    app.innerHTML = '<div class="coaching-error"><strong>Falta elegir un alumno.</strong>Volvé al panel y abrí Nutrición desde la ficha del alumno.</div>';
    return;
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function parseIso(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  }

  function toIso(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function todayIso() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function addDays(value, amount) {
    const date = parseIso(value);
    date.setDate(date.getDate() + amount);
    return toIso(date);
  }

  function startOfWeek(value) {
    const date = parseIso(value);
    const offset = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - offset);
    return toIso(date);
  }

  function weekDates() {
    return Array.from({ length: 7 }, (_, index) => addDays(state.weekStart, index));
  }

  function formatDay(value, options = {}) {
    return new Intl.DateTimeFormat("es-AR", {
      weekday: options.weekday || undefined,
      day: "numeric",
      month: options.month || "long",
      year: options.year || undefined
    }).format(parseIso(value));
  }

  function initials(name) {
    const parts = String(name || "Alumna").trim().split(/\s+/).filter(Boolean);
    return (parts[0]?.[0] || "A") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
  }

  function mealLabel(type) {
    return MEAL_TYPES.find(item => item[0] === type)?.[1] || "Comida";
  }

  function statusLabel(status) {
    return REVIEW_LABELS[status] || REVIEW_LABELS.pending;
  }

  async function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${session.token}`);
    if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(sessionKey);
      window.location.href = "/login.html";
      throw new Error("La sesión venció. Volvé a ingresar.");
    }
    if (!response.ok) {
      let message = "No se pudo completar la acción.";
      try {
        const data = await response.json();
        message = data.error || data.message || message;
      } catch (_) {}
      throw new Error(message);
    }
    return response;
  }

  function setNavigation(student) {
    const name = student?.full_name || session.name || "Alumna";
    document.getElementById("sidebarName").textContent = name;
    document.getElementById("sidebarAvatar").textContent = initials(name).toUpperCase();
    const query = `?id=${encodeURIComponent(studentId)}`;
    if (ROLE === "admin") {
      document.getElementById("topBackLink").href = `alumno.html${query}`;
      document.getElementById("profileNavLink").href = `alumno.html${query}#datos`;
      document.getElementById("calendarNavLink").href = `alumno.html${query}#calendario-mensual`;
      document.getElementById("trainingNavLink").href = `entrenamiento.html${query}`;
      document.getElementById("measurementsNavLink").href = `mediciones-starfit.html${query}`;
      document.getElementById("guideLink").href = `../nutricion.html?origen=admin&id=${encodeURIComponent(studentId)}`;
    } else {
      document.getElementById("topBackLink").href = `index.html${query}`;
      document.getElementById("studentHomeLink").href = `index.html${query}`;
      document.getElementById("studentDashboardLink").href = `index.html${query}`;
      document.getElementById("studentTrainingLink").href = `entrenamiento.html${query}`;
      document.getElementById("studentEvolutionLink").href = `index.html${query}&section=tracking`;
      document.getElementById("guideLink").href = `../nutricion.html?origen=alumno&id=${encodeURIComponent(studentId)}`;
    }
  }

  async function loadWeek() {
    state.message = "";
    const from = state.weekStart;
    const to = addDays(from, 6);
    const response = await apiFetch(`/api/students/${encodeURIComponent(studentId)}/nutrition?from=${from}&to=${to}`);
    state.data = await response.json();
    setNavigation(state.data.student);
    const dates = weekDates();
    if (!dates.includes(state.selectedDate)) state.selectedDate = dates[0];
    const visibleMeals = state.data.meals || [];
    if (state.selectedMealId && !visibleMeals.some(meal => String(meal.id) === String(state.selectedMealId))) {
      state.selectedMealId = null;
    }
    render();
  }

  function planMarkup() {
    const plan = state.data.plan || {};
    const adminFields = `
      <div class="plan-fields">
        <div class="plan-field">
          <label for="generalGoalInput">Objetivo general</label>
          <textarea id="generalGoalInput" placeholder="Definí el objetivo general de este alumno.">${esc(plan.general_goal || "")}</textarea>
        </div>
        <div class="plan-field">
          <label for="monthlyGoalInput">Objetivo mensual</label>
          <textarea id="monthlyGoalInput" placeholder="Definí el foco concreto para este mes.">${esc(plan.monthly_goal || "")}</textarea>
        </div>
      </div>
      <div class="panel-actions">
        <button class="nutrition-button dark" id="savePlanButton" type="button">Guardar objetivos</button>
        <p class="save-status ${esc(state.messageKind)}" id="planStatus">${state.messageScope === "plan" ? esc(state.message) : ""}</p>
      </div>`;
    const studentFields = `
      <div class="plan-readonly">
        <article class="plan-value">
          <span>Objetivo general</span>
          <p>${esc(plan.general_goal || "Yanina todavía no cargó este objetivo.")}</p>
        </article>
        <article class="plan-value">
          <span>Objetivo mensual</span>
          <p>${esc(plan.monthly_goal || "Yanina todavía no cargó el objetivo de este mes.")}</p>
        </article>
      </div>`;
    return `
      <section class="nutrition-card plan-card">
        <div class="card-heading">
          <div>
            <p class="nutrition-eyebrow">Seguimiento nutricional</p>
            <h2>Tu plan</h2>
            <p>${ROLE === "admin"
              ? `Objetivos personalizados de ${esc(state.data.student.full_name || "este alumno")}.`
              : "Tus objetivos acordados con Yanina, siempre visibles y actualizados."}</p>
          </div>
          <a class="nutrition-button secondary" href="../nutricion.html?origen=${ROLE === "admin" ? "admin" : "alumno"}&id=${encodeURIComponent(studentId)}">Guía de alimentos</a>
        </div>
        ${ROLE === "admin" ? adminFields : studentFields}
      </section>`;
  }

  function weekHeaderMarkup() {
    const end = addDays(state.weekStart, 6);
    return `
      <div class="nutrition-page-head">
        <div>
          <p class="nutrition-eyebrow">${ROLE === "admin" ? "Vista Yanina" : "Vista alumna"}</p>
          <h1>Nutrición</h1>
          <p>Registro visual, hábitos y devolución personalizada dentro del proceso real de entrenamiento.</p>
        </div>
        <div class="week-actions" aria-label="Cambiar semana">
          <button class="nutrition-icon-button" id="previousWeekButton" type="button" aria-label="Semana anterior">‹</button>
          <button class="nutrition-button secondary" id="currentWeekButton" type="button">${esc(formatDay(state.weekStart, { month: "short" }))} – ${esc(formatDay(end, { month: "short" }))}</button>
          <button class="nutrition-icon-button" id="nextWeekButton" type="button" aria-label="Semana siguiente">›</button>
        </div>
      </div>`;
  }

  function habitFor(date) {
    return (state.data.habits || []).find(item => item.habit_date === date) || {
      habit_date: date,
      water_glasses: 0,
      vegetables_meals: 0,
      protein_meals: 0
    };
  }

  function mealsFor(date) {
    return (state.data.meals || []).filter(meal => meal.meal_date === date);
  }

  function weekStripMarkup(selectedDate, allowToggle = false) {
    const dayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    return `
      <div class="week-strip" role="list" aria-label="Días de la semana">
        ${weekDates().map((date, index) => {
          const meals = mealsFor(date);
          const habit = habitFor(date);
          const hasData = meals.length || habit.water_glasses || habit.vegetables_meals || habit.protein_meals;
          const active = selectedDate === date;
          return `<button class="week-day ${hasData ? "has-data" : ""} ${active ? "active" : ""}" type="button" data-week-date="${date}" aria-pressed="${active}">
            <span>${dayNames[index]}</span>
            <strong>${parseIso(date).getDate()}</strong>
            <small>${meals.length ? `${meals.length} registro${meals.length === 1 ? "" : "s"}` : (allowToggle && active ? "Quitar filtro" : "Sin registro")}</small>
          </button>`;
        }).join("")}
      </div>`;
  }

  function habitCard(key, label, current, target, unit) {
    const percentage = Math.min(100, Math.round((Number(current || 0) / Number(target || 1)) * 100));
    return `
      <article class="habit-card">
        <div class="habit-title"><strong>${esc(label)}</strong><span>${percentage}%</span></div>
        <div class="habit-progress" aria-label="${percentage}%"><span style="width:${percentage}%"></span></div>
        <div class="habit-count">
          <span><b>${Number(current || 0)}</b> / ${Number(target)} ${esc(unit)}</span>
          <div class="counter-actions" aria-label="Actualizar ${esc(label)}">
            <button type="button" data-habit-key="${key}" data-habit-delta="-1" aria-label="Restar">−</button>
            <button type="button" data-habit-key="${key}" data-habit-delta="1" aria-label="Sumar">+</button>
          </div>
        </div>
      </article>`;
  }

  function photoMarkup(meal, className = "meal-photo") {
    if (!meal) return `<div class="${className}"><span>＋</span></div>`;
    return `<div class="${className}"><img data-protected-photo="${esc(meal.photo_url)}" alt="Foto de ${esc(mealLabel(meal.meal_type))}"></div>`;
  }

  function selectedStudentMeal() {
    const dayMeals = mealsFor(state.selectedDate);
    const selected = dayMeals.find(meal => String(meal.id) === String(state.selectedMealId));
    return selected || dayMeals[0] || null;
  }

  function studentMealDetailMarkup(meal) {
    if (!meal) return "";
    return `
      <div class="meal-detail">
        ${photoMarkup(meal, "review-photo")}
        <div>
          <p class="nutrition-eyebrow">${esc(formatDay(meal.meal_date, { weekday: "long" }))}</p>
          <h4>${esc(mealLabel(meal.meal_type))}</h4>
          <p>${esc(meal.note || "Sin comentario agregado.")}</p>
          <span class="meal-status ${esc(meal.review_status)}">${esc(statusLabel(meal.review_status))}</span>
          <div class="feedback-box">
            <strong>Devolución de Yanina</strong>
            <p>${esc(meal.trainer_comment || (meal.review_status === "pending" ? "Pendiente de revisión." : "Revisado sin comentario adicional."))}</p>
          </div>
        </div>
      </div>`;
  }

  function composerMarkup() {
    const firstEmpty = state.composerMealType
      || MEAL_TYPES.find(([type]) => !mealsFor(state.selectedDate).some(meal => meal.meal_type === type))?.[0]
      || "breakfast";
    return `
      <div class="meal-composer" id="mealComposer">
        <div class="card-heading">
          <div><h3>Registrar comida</h3><p>${esc(formatDay(state.selectedDate, { weekday: "long" }))}</p></div>
          <button class="nutrition-button secondary" id="closeComposerButton" type="button">Cerrar</button>
        </div>
        <div class="composer-grid">
          <div class="composer-field">
            <label for="mealTypeInput">Comida</label>
            <select id="mealTypeInput">
              ${MEAL_TYPES.map(([value, label]) => `<option value="${value}" ${value === firstEmpty ? "selected" : ""}>${esc(label)}</option>`).join("")}
            </select>
          </div>
          <div class="composer-field">
            <label for="mealPhotoInput">Foto</label>
            <input id="mealPhotoInput" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif">
            <p class="composer-help">JPG, PNG, WebP o HEIC · hasta 8 MB.</p>
          </div>
          <div class="composer-field full">
            <label for="mealNoteInput">Comentario opcional</label>
            <textarea id="mealNoteInput" placeholder="Ej.: almuerzo después de entrenar, tenía poco tiempo, cambié una guarnición…"></textarea>
          </div>
        </div>
        <div class="panel-actions">
          <button class="nutrition-button dark" id="saveMealButton" type="button">Guardar registro</button>
          <p class="save-status ${esc(state.messageKind)}" id="mealSaveStatus">${state.messageScope === "meal" ? esc(state.message) : ""}</p>
        </div>
      </div>`;
  }

  function studentMarkup() {
    const plan = state.data.plan || {};
    const habit = habitFor(state.selectedDate);
    const chosen = selectedStudentMeal();
    if (chosen && !state.selectedMealId) state.selectedMealId = chosen.id;
    return `
      <section class="nutrition-card">
        <div class="card-heading">
          <div>
            <p class="nutrition-eyebrow">Hábitos del día</p>
            <h3>${esc(formatDay(state.selectedDate, { weekday: "long" }))}</h3>
            <p>Tocá + o − para llevar el registro real de cada hábito.</p>
          </div>
          <span class="meal-status good">3 hábitos activos</span>
        </div>
        <div class="habit-grid">
          ${habitCard("water_glasses", "Agua", habit.water_glasses, plan.water_target || 8, "vasos")}
          ${habitCard("vegetables_meals", "Vegetales", habit.vegetables_meals, plan.vegetables_target || 3, "comidas")}
          ${habitCard("protein_meals", "Proteína", habit.protein_meals, plan.protein_target || 2, "comidas")}
        </div>
      </section>

      <section class="nutrition-card">
        <div class="card-heading">
          <div>
            <p class="nutrition-eyebrow">Mi semana</p>
            <h3>${esc(formatDay(state.selectedDate, { weekday: "long" }))}</h3>
            <p>Elegí un día para ver sus comidas y la devolución de Yanina.</p>
          </div>
          <button class="nutrition-button" id="openComposerButton" type="button">+ Registrar comida</button>
        </div>
        ${weekStripMarkup(state.selectedDate)}
        <div class="meal-grid">
          ${MEAL_TYPES.map(([type, label]) => {
            const meal = mealsFor(state.selectedDate).find(item => item.meal_type === type);
            const active = meal && String(meal.id) === String(state.selectedMealId);
            return `<button class="meal-card ${active ? "active" : ""}" type="button" data-meal-id="${meal ? esc(meal.id) : ""}" data-empty-meal-type="${meal ? "" : type}">
              ${photoMarkup(meal)}
              <span class="meal-card-body">
                <strong>${esc(label)}</strong>
                <p>${esc(meal?.note || "Sin registrar")}</p>
                <span class="meal-status ${esc(meal?.review_status || "")}">${meal ? esc(statusLabel(meal.review_status)) : "Sin registrar"}</span>
              </span>
            </button>`;
          }).join("")}
        </div>
        ${studentMealDetailMarkup(chosen)}
        ${state.composerOpen ? composerMarkup() : ""}
      </section>`;
  }

  function completionPercent() {
    const plan = state.data.plan || {};
    const today = todayIso();
    const dates = weekDates().filter(date => state.weekStart > today ? false : (state.weekStart <= today && addDays(state.weekStart, 6) >= today ? date <= today : true));
    if (!dates.length) return 0;
    const score = dates.reduce((total, date) => {
      const habit = habitFor(date);
      return total
        + Math.min(1, habit.water_glasses / (plan.water_target || 8))
        + Math.min(1, habit.vegetables_meals / (plan.vegetables_target || 3))
        + Math.min(1, habit.protein_meals / (plan.protein_target || 2));
    }, 0);
    return Math.round((score / (dates.length * 3)) * 100);
  }

  function filteredAdminMeals() {
    const meals = [...(state.data.meals || [])];
    const filtered = state.adminDayFilter ? meals.filter(meal => meal.meal_date === state.adminDayFilter) : meals;
    return filtered.sort((a, b) => {
      const pendingOrder = Number(a.review_status !== "pending") - Number(b.review_status !== "pending");
      return pendingOrder || String(b.meal_date).localeCompare(String(a.meal_date)) || Number(b.id) - Number(a.id);
    });
  }

  function selectedAdminMeal() {
    const meals = filteredAdminMeals();
    const selected = meals.find(meal => String(meal.id) === String(state.selectedMealId));
    return selected || meals[0] || null;
  }

  function reviewDetailMarkup(meal) {
    if (!meal) {
      return '<div class="nutrition-empty">Seleccioná una comida para ver la foto y guardar una devolución.</div>';
    }
    const selectedStatus = state.reviewStatus === "pending" ? meal.review_status : state.reviewStatus;
    return `
      <div class="review-detail">
        ${photoMarkup(meal, "review-photo")}
        <p class="nutrition-eyebrow">${esc(formatDay(meal.meal_date, { weekday: "long" }))}</p>
        <h4>${esc(mealLabel(meal.meal_type))}</h4>
        <p>${esc(meal.note || "Sin comentario de la alumna.")}</p>
        <div class="meal-review-actions" aria-label="Estado de la devolución">
          ${[
            ["good", "Bien"],
            ["review", "Revisar"],
            ["no_comment", "Sin comentario"]
          ].map(([value, label]) => `<button class="review-choice ${selectedStatus === value ? "active" : ""}" type="button" data-review-status="${value}">${label}</button>`).join("")}
        </div>
        <div class="review-comment-field">
          <label for="trainerCommentInput">Comentario de Yanina</label>
          <textarea id="trainerCommentInput" placeholder="Escribí una devolución concreta para esta comida.">${esc(state.reviewComment ?? meal.trainer_comment ?? "")}</textarea>
        </div>
        <div class="panel-actions">
          <button class="nutrition-button dark" id="saveReviewButton" type="button">Guardar devolución</button>
          <p class="save-status ${esc(state.messageKind)}" id="reviewSaveStatus">${state.messageScope === "review" ? esc(state.message) : ""}</p>
        </div>
      </div>`;
  }

  function adminMarkup() {
    const meals = filteredAdminMeals();
    const selected = selectedAdminMeal();
    if (selected && !state.selectedMealId) {
      state.selectedMealId = selected.id;
      state.reviewStatus = selected.review_status;
      state.reviewComment = selected.trainer_comment || "";
    }
    const pending = (state.data.meals || []).filter(meal => meal.review_status === "pending").length;
    return `
      <div class="summary-grid">
        <article class="summary-card"><span>Cumplimiento semanal</span><strong>${completionPercent()}%</strong><small>Hábitos registrados hasta hoy</small></article>
        <article class="summary-card"><span>Para revisar</span><strong>${pending}</strong><small>Comidas pendientes de devolución</small></article>
        <article class="summary-card"><span>Hábitos</span><strong>3</strong><small>Agua, vegetales y proteína</small></article>
      </div>

      <section class="nutrition-card">
        <div class="card-heading">
          <div>
            <p class="nutrition-eyebrow">Seguimiento semanal</p>
            <h3>${esc(state.data.student.full_name || "Alumno")}</h3>
            <p>Elegí un día para filtrar sus registros o volvé a ver la semana completa.</p>
          </div>
          ${state.adminDayFilter ? '<button class="nutrition-button secondary" id="clearDayFilterButton" type="button">Ver toda la semana</button>' : ""}
        </div>
        ${weekStripMarkup(state.adminDayFilter, true)}
      </section>

      <div class="coach-grid">
        <section class="nutrition-card">
          <div class="card-heading">
            <div>
              <p class="nutrition-eyebrow">Comidas registradas</p>
              <h3>${state.adminDayFilter ? esc(formatDay(state.adminDayFilter, { weekday: "long" })) : "Semana completa"}</h3>
            </div>
          </div>
          <div class="review-list">
            ${meals.length ? meals.map(meal => `
              <button class="review-item ${String(meal.id) === String(state.selectedMealId) ? "active" : ""}" type="button" data-review-meal-id="${esc(meal.id)}">
                <span><strong>${esc(mealLabel(meal.meal_type))}</strong><small>${esc(formatDay(meal.meal_date, { weekday: "short", month: "short" }))}</small></span>
                <span class="meal-status ${esc(meal.review_status)}">${esc(statusLabel(meal.review_status))}</span>
              </button>`).join("") : '<div class="nutrition-empty">No hay comidas registradas en este período.</div>'}
          </div>
        </section>
        <section class="nutrition-card">
          <div class="card-heading">
            <div><p class="nutrition-eyebrow">Devolución</p><h3>Comida seleccionada</h3></div>
          </div>
          ${reviewDetailMarkup(selected)}
        </section>
      </div>`;
  }

  function render() {
    app.innerHTML = `${weekHeaderMarkup()}${planMarkup()}${ROLE === "admin" ? adminMarkup() : studentMarkup()}`;
    bindCommonEvents();
    if (ROLE === "admin") bindAdminEvents();
    else bindStudentEvents();
    hydrateProtectedImages();
  }

  function bindCommonEvents() {
    document.getElementById("previousWeekButton")?.addEventListener("click", async () => {
      state.weekStart = addDays(state.weekStart, -7);
      state.selectedDate = state.weekStart;
      state.adminDayFilter = null;
      state.selectedMealId = null;
      state.reviewStatus = "pending";
      state.reviewComment = null;
      await loadWeek().catch(showError);
    });
    document.getElementById("nextWeekButton")?.addEventListener("click", async () => {
      state.weekStart = addDays(state.weekStart, 7);
      state.selectedDate = state.weekStart;
      state.adminDayFilter = null;
      state.selectedMealId = null;
      state.reviewStatus = "pending";
      state.reviewComment = null;
      await loadWeek().catch(showError);
    });
    document.getElementById("currentWeekButton")?.addEventListener("click", async () => {
      state.weekStart = startOfWeek(todayIso());
      state.selectedDate = todayIso();
      state.adminDayFilter = null;
      state.selectedMealId = null;
      state.reviewStatus = "pending";
      state.reviewComment = null;
      await loadWeek().catch(showError);
    });
    document.getElementById("savePlanButton")?.addEventListener("click", savePlan);
  }

  function bindStudentEvents() {
    document.querySelectorAll("[data-week-date]").forEach(button => {
      button.addEventListener("click", () => {
        state.selectedDate = button.dataset.weekDate;
        state.selectedMealId = null;
        state.composerOpen = false;
        state.composerMealType = null;
        state.message = "";
        render();
      });
    });
    document.querySelectorAll("[data-habit-key]").forEach(button => {
      button.addEventListener("click", () => adjustHabit(button.dataset.habitKey, Number(button.dataset.habitDelta)));
    });
    document.querySelectorAll(".meal-card").forEach(button => {
      button.addEventListener("click", () => {
        if (button.dataset.mealId) {
          state.selectedMealId = button.dataset.mealId;
          state.composerOpen = false;
        } else {
          state.composerOpen = true;
          state.composerMealType = button.dataset.emptyMealType || null;
        }
        state.message = "";
        render();
      });
    });
    document.getElementById("openComposerButton")?.addEventListener("click", () => {
      state.composerOpen = true;
      state.composerMealType = null;
      state.message = "";
      render();
      document.getElementById("mealComposer")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    document.getElementById("closeComposerButton")?.addEventListener("click", () => {
      state.composerOpen = false;
      state.composerMealType = null;
      state.message = "";
      render();
    });
    document.getElementById("saveMealButton")?.addEventListener("click", saveMeal);
  }

  function bindAdminEvents() {
    document.querySelectorAll("[data-week-date]").forEach(button => {
      button.addEventListener("click", () => {
        state.adminDayFilter = state.adminDayFilter === button.dataset.weekDate ? null : button.dataset.weekDate;
        state.selectedMealId = null;
        state.reviewStatus = "pending";
        state.reviewComment = null;
        state.message = "";
        render();
      });
    });
    document.getElementById("clearDayFilterButton")?.addEventListener("click", () => {
      state.adminDayFilter = null;
      state.selectedMealId = null;
      state.reviewStatus = "pending";
      state.reviewComment = null;
      state.message = "";
      render();
    });
    document.querySelectorAll("[data-review-meal-id]").forEach(button => {
      button.addEventListener("click", () => {
        state.selectedMealId = button.dataset.reviewMealId;
        const meal = (state.data.meals || []).find(item => String(item.id) === String(state.selectedMealId));
        state.reviewStatus = meal?.review_status || "pending";
        state.reviewComment = meal?.trainer_comment || "";
        state.message = "";
        render();
      });
    });
    document.querySelectorAll("[data-review-status]").forEach(button => {
      button.addEventListener("click", () => {
        state.reviewComment = document.getElementById("trainerCommentInput")?.value || "";
        state.reviewStatus = button.dataset.reviewStatus;
        state.message = "";
        render();
      });
    });
    document.getElementById("saveReviewButton")?.addEventListener("click", saveReview);
  }

  async function savePlan() {
    const button = document.getElementById("savePlanButton");
    const generalGoal = document.getElementById("generalGoalInput")?.value || "";
    const monthlyGoal = document.getElementById("monthlyGoalInput")?.value || "";
    button.disabled = true;
    state.message = "Guardando…";
    state.messageKind = "";
    state.messageScope = "plan";
    document.getElementById("planStatus").textContent = state.message;
    try {
      const response = await apiFetch(`/api/students/${encodeURIComponent(studentId)}/nutrition`, {
        method: "PUT",
        body: JSON.stringify({ general_goal: generalGoal, monthly_goal: monthlyGoal })
      });
      const data = await response.json();
      state.data.plan = data.plan;
      state.message = "Objetivos guardados.";
      state.messageKind = "success";
      state.messageScope = "plan";
      render();
    } catch (error) {
      state.message = error.message;
      state.messageKind = "error";
      state.messageScope = "plan";
      render();
    }
  }

  async function adjustHabit(key, delta) {
    const habit = { ...habitFor(state.selectedDate) };
    habit[key] = Math.max(0, Number(habit[key] || 0) + delta);
    const existingIndex = (state.data.habits || []).findIndex(item => item.habit_date === state.selectedDate);
    if (existingIndex >= 0) state.data.habits[existingIndex] = habit;
    else state.data.habits.push(habit);
    render();
    try {
      const response = await apiFetch(`/api/students/${encodeURIComponent(studentId)}/nutrition/habits/${state.selectedDate}`, {
        method: "PUT",
        body: JSON.stringify(habit)
      });
      const saved = await response.json();
      const index = state.data.habits.findIndex(item => item.habit_date === state.selectedDate);
      state.data.habits[index] = saved;
      render();
    } catch (error) {
      state.message = error.message;
      state.messageKind = "error";
      await loadWeek().catch(showError);
    }
  }

  async function saveMeal() {
    const button = document.getElementById("saveMealButton");
    const file = document.getElementById("mealPhotoInput")?.files?.[0];
    const mealType = document.getElementById("mealTypeInput")?.value;
    const note = document.getElementById("mealNoteInput")?.value || "";
    const status = document.getElementById("mealSaveStatus");
    if (!file) {
      state.message = "Elegí una foto para guardar el registro.";
      state.messageKind = "error";
      state.messageScope = "meal";
      status.textContent = state.message;
      status.className = "save-status error";
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      state.message = "La imagen debe pesar hasta 8 MB.";
      state.messageKind = "error";
      state.messageScope = "meal";
      status.textContent = state.message;
      status.className = "save-status error";
      return;
    }
    button.disabled = true;
    status.textContent = "Subiendo foto…";
    status.className = "save-status";
    try {
      const uploadResponse = await apiFetch(`/api/students/${encodeURIComponent(studentId)}/nutrition/meals/direct-upload`, {
        method: "POST",
        body: JSON.stringify({
          file_name: file.name,
          content_type: file.type || "image/jpeg",
          file_size: file.size
        })
      });
      const upload = await uploadResponse.json();
      const putResponse = await fetch(upload.upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file
      });
      if (!putResponse.ok) throw new Error("No se pudo subir la foto.");
      status.textContent = "Guardando registro…";
      const completeResponse = await apiFetch(`/api/students/${encodeURIComponent(studentId)}/nutrition/meals/direct-upload/complete`, {
        method: "POST",
        body: JSON.stringify({
          file_key: upload.file_key,
          file_name: file.name,
          content_type: file.type || "image/jpeg",
          meal_date: state.selectedDate,
          meal_type: mealType,
          note
        })
      });
      const saved = await completeResponse.json();
      const index = (state.data.meals || []).findIndex(meal =>
        meal.meal_date === saved.meal_date && meal.meal_type === saved.meal_type
      );
      if (index >= 0) state.data.meals[index] = saved;
      else state.data.meals.push(saved);
      state.selectedMealId = saved.id;
      state.composerOpen = false;
      state.composerMealType = null;
      state.message = "Comida registrada para Yanina.";
      state.messageKind = "success";
      state.messageScope = "meal";
      render();
    } catch (error) {
      button.disabled = false;
      state.message = error.message;
      state.messageKind = "error";
      state.messageScope = "meal";
      status.textContent = state.message;
      status.className = "save-status error";
    }
  }

  async function saveReview() {
    const meal = (state.data.meals || []).find(item => String(item.id) === String(state.selectedMealId)) || selectedAdminMeal();
    if (!meal) return;
    const status = state.reviewStatus === "pending" ? meal.review_status : state.reviewStatus;
    const comment = document.getElementById("trainerCommentInput")?.value || state.reviewComment || "";
    if (!status || status === "pending") {
      state.message = "Elegí Bien, Revisar o Sin comentario.";
      state.messageKind = "error";
      state.messageScope = "review";
      render();
      return;
    }
    const button = document.getElementById("saveReviewButton");
    button.disabled = true;
    document.getElementById("reviewSaveStatus").textContent = "Guardando…";
    try {
      const response = await apiFetch(`/api/nutrition-meals/${encodeURIComponent(meal.id)}/review`, {
        method: "PATCH",
        body: JSON.stringify({ review_status: status, trainer_comment: comment })
      });
      const saved = await response.json();
      const index = state.data.meals.findIndex(item => String(item.id) === String(saved.id));
      state.data.meals[index] = saved;
      state.reviewStatus = saved.review_status;
      state.reviewComment = saved.trainer_comment || "";
      state.message = "Devolución guardada y visible para la alumna.";
      state.messageKind = "success";
      state.messageScope = "review";
      render();
    } catch (error) {
      state.message = error.message;
      state.messageKind = "error";
      state.messageScope = "review";
      render();
    }
  }

  async function hydrateProtectedImages() {
    const images = [...document.querySelectorAll("img[data-protected-photo]")];
    await Promise.all(images.map(async image => {
      const path = image.dataset.protectedPhoto;
      if (!path) return;
      if (photoCache.has(path)) {
        image.src = photoCache.get(path);
        return;
      }
      try {
        const response = await apiFetch(path);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        photoCache.set(path, url);
        image.src = url;
      } catch (_) {
        image.closest(".meal-photo, .review-photo")?.classList.add("photo-unavailable");
        image.remove();
      }
    }));
  }

  function showError(error) {
    app.innerHTML = `<div class="coaching-error"><strong>No se pudo abrir Nutrición.</strong>${esc(error.message || "Intentá nuevamente.")}</div>`;
  }

  loadWeek().catch(showError);
})();
