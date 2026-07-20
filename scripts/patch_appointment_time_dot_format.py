from pathlib import Path

PAGE = Path("admin/alumno.html")
MARKER = "YANINA_APPOINTMENT_TIME_DOT_V5"

text = PAGE.read_text(encoding="utf-8")

if MARKER in text:
    print("Appointment time dot-format patch already applied")
    raise SystemExit(0)


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one {label}; found {count}")
    text = text.replace(old, new, 1)


replace_once(
    'id="appointmentTimeInput" type="time" step="300"',
    'id="appointmentTimeInput" type="text" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="Ej. 18.30"',
    "appointment time input",
)

replace_once(
    "    /* YANINA_APPOINTMENT_TRAINING_FINAL_V4 */",
    "    /* YANINA_APPOINTMENT_TRAINING_FINAL_V4 */\n"
    "    /* YANINA_APPOINTMENT_TIME_DOT_V5 */\n"
    "    #appointmentTimeInput { font-variant-numeric: tabular-nums; letter-spacing: .05em; }",
    "final appointment style marker",
)

replace_once(
    "    let appointmentClassSnapshot = null;",
    "    let appointmentClassSnapshot = null;\n\n"
    "    function formatAppointmentTime(value) {\n"
    "      const match = String(value || \"\").trim().match(/^(\\d{1,2})[.:](\\d{2})/);\n"
    "      if (!match) return \"\";\n"
    "      const hours = Number(match[1]);\n"
    "      const minutes = Number(match[2]);\n"
    "      if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) return \"\";\n"
    "      return `${String(hours).padStart(2, \"0\")}.${String(minutes).padStart(2, \"0\")}`;\n"
    "    }\n\n"
    "    function normalizeAppointmentTime(value) {\n"
    "      const match = String(value || \"\").trim().match(/^(\\d{1,2})[.:](\\d{2})$/);\n"
    "      if (!match) return \"\";\n"
    "      const hours = Number(match[1]);\n"
    "      const minutes = Number(match[2]);\n"
    "      if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) return \"\";\n"
    "      return `${String(hours).padStart(2, \"0\")}:${String(minutes).padStart(2, \"0\")}`;\n"
    "    }\n\n"
    "    appointmentTimeInput?.addEventListener(\"blur\", () => {\n"
    "      const normalized = normalizeAppointmentTime(appointmentTimeInput.value);\n"
    "      if (normalized) appointmentTimeInput.value = formatAppointmentTime(normalized);\n"
    "    });",
    "appointment state declaration",
)

replace_once(
    '      appointmentTimeInput.value = normalizeTimeForInput(item?.class_time || "");',
    '      appointmentTimeInput.value = formatAppointmentTime(item?.class_time || "");',
    "appointment modal time assignment",
)

replace_once(
    '      const classDate = appointmentDateInput.value, classTime = appointmentTimeInput.value, comments = appointmentCommentsInput.value || "";',
    '      const classDate = appointmentDateInput.value, classTime = normalizeAppointmentTime(appointmentTimeInput.value), comments = appointmentCommentsInput.value || "";',
    "appointment save values",
)

replace_once(
    '      if (!classTime) return showAppointmentState("Cargá la hora de la cita.", true);',
    '      if (!classTime) return showAppointmentState("Cargá una hora válida en formato hh.mm, por ejemplo 18.30.", true);\n      appointmentTimeInput.value = formatAppointmentTime(classTime);',
    "appointment time validation",
)

replace_once(
    "class_time:appointmentClassSnapshot.class_time || appointmentTimeInput.value",
    "class_time:appointmentClassSnapshot.class_time || normalizeAppointmentTime(appointmentTimeInput.value) || \"\"",
    "forced delete appointment time",
)

replace_once(
    'normalizeTimeForInput(appointment.class_time || "") || "Cita"',
    'formatAppointmentTime(appointment.class_time || "") || "Cita"',
    "appointment calendar time display",
)

PAGE.write_text(text, encoding="utf-8")
print("Applied strict hh.mm appointment time format")
