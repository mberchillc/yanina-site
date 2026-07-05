import json
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
PREVIEW_BASE = "https://845cbdc1.yanina-site.pages.dev"
IDS = [
    "sentadilla",
    "sentadilla-isometrica-pared",
    "sentadilla-sumo",
    "zancada",
    "patada-gluteo-banda-tobillera",
    "abduccion-banda-tobillera",
    "peso-muerto-1-pierna",
    "elevacion-gemelos",
    "remo-mancuerna-1-brazo",
    "extensiones-triceps",
    "crunch",
    "oblicuo-codo-rodilla",
    "up-down-plancha",
    "burpees",
    "jumping-jacks",
    "escaladores",
]


def download(path):
    with urlopen(f"{PREVIEW_BASE}/{path}", timeout=90) as response:
        if response.status != 200:
            raise RuntimeError(f"{path} returned {response.status}")
        return response.read()


assets_dir = ROOT / "assets" / "exercises"
assets_dir.mkdir(parents=True, exist_ok=True)
for exercise_id in IDS:
    target = assets_dir / f"{exercise_id}.png"
    target.write_bytes(download(f"assets/exercises/{exercise_id}.png"))

exercises = json.loads(download("exercises.json").decode("utf-8"))
by_id = {item.get("id"): item for item in exercises}
for exercise_id in IDS:
    if exercise_id not in by_id:
        raise RuntimeError(f"Missing exercise in downloaded JSON: {exercise_id}")
    visual = by_id[exercise_id].get("visual_image", "")
    if visual.startswith("data:"):
        raise RuntimeError(f"Placeholder visual still present for {exercise_id}")
(ROOT / "exercises.json").write_text(json.dumps(exercises, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

admin_html = download("admin/biblioteca-ejercicios.html").decode("utf-8")
if "Fase actual" in admin_html or "status-note" in admin_html:
    raise RuntimeError("Footer/status note still present in preview HTML")
(ROOT / "admin" / "biblioteca-ejercicios.html").write_text(admin_html, encoding="utf-8")

generator_path = ROOT / "scripts" / "generate_exercise_library.py"
if generator_path.exists():
    generator = generator_path.read_text(encoding="utf-8")
    generator = generator.replace(
        '"visual_image": visual_data_uri(name, steps),',
        '"visual_image": f"assets/exercises/{ex_id}.png?v=exercise-pro-1",',
    )
    generator = generator.replace(
        '"visual_image": visual_data_uri(item),',
        '"visual_image": f"assets/exercises/{item[\'id\']}.png?v=exercise-pro-1",',
    )
    generator_path.write_text(generator, encoding="utf-8")

print("patched professional exercise assets", len(IDS))

# Triggered after workflow creation.
