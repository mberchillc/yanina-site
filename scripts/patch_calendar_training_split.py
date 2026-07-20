# Generates the appointment calendar behavior and the dedicated training workspace.
from pathlib import Path

SOURCE = Path("admin/alumno.html")
TRAINING = Path("admin/entrenamiento.html")
JAVASCRIPT = Path("admin/calendar-training.js")
PARTS_DIR = Path("scripts/calendar_training_parts")
STYLE_TAG = '  <link rel="stylesheet" href="calendar-training.css" />\n'
SCRIPT_TAG = '  <script src="calendar-training.js"></script>\n'

parts = sorted(PARTS_DIR.glob("*.js.part"))
if not parts:
    raise RuntimeError("No se encontraron las partes de calendar-training.js")
JAVASCRIPT.write_text("".join(part.read_text(encoding="utf-8") for part in parts), encoding="utf-8")

html = SOURCE.read_text(encoding="utf-8")

if "calendar-training.css" not in html:
    if "</head>" not in html:
        raise RuntimeError("No se encontró </head> en admin/alumno.html")
    html = html.replace("</head>", f"{STYLE_TAG}</head>", 1)

if '<body data-page="calendar">' not in html:
    if "<body>" not in html:
        raise RuntimeError("No se encontró <body> en admin/alumno.html")
    html = html.replace("<body>", '<body data-page="calendar">', 1)

if "calendar-training.js" not in html:
    if "</body>" not in html:
        raise RuntimeError("No se encontró </body> en admin/alumno.html")
    html = html.replace("</body>", f"{SCRIPT_TAG}</body>", 1)

SOURCE.write_text(html, encoding="utf-8")

training_html = html.replace(
    '<body data-page="calendar">',
    '<body data-page="training">',
    1,
)
training_html = training_html.replace(
    "<title>Ficha del Alumno | Yanina Trainer</title>",
    "<title>Entrenamiento | Yanina Trainer</title>",
    1,
)
TRAINING.write_text(training_html, encoding="utf-8")

print("Calendario de citas actualizado y admin/entrenamiento.html generado.")
