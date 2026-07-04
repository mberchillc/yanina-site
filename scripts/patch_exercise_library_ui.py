from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch_admin_library():
    path = ROOT / "admin" / "biblioteca-ejercicios.html"
    text = path.read_text(encoding="utf-8")
    original = text
    text = text.replace(
        "const assetPath = path => !path ? '' : String(path).startsWith('../') ? path : `../${path}`;",
        """const assetPath = path => {
      if(!path) return '';
      const raw = String(path);
      return raw.startsWith('../') || raw.startsWith('data:') || raw.startsWith('http') ? raw : `../${raw}`;
    };""",
    )
    text = text.replace(
        "const candidatePaths = id => (exerciseImageCandidates[id] || [id]).map(name => withCache(`assets/exercises/${name}.png`));",
        """const candidatePaths = item => {
      if(item && item.visual_image) return [item.visual_image];
      const id = item && item.id ? item.id : item;
      return (exerciseImageCandidates[id] || [id]).map(name => withCache(`assets/exercises/${name}.png`));
    };""",
    )
    text = text.replace("const fullImages = candidatePaths(item.id);", "const fullImages = candidatePaths(item);")
    if text != original:
        path.write_text(text, encoding="utf-8")
    print("admin library changed", text != original)


def patch_student_page(rel_path):
    path = ROOT / rel_path
    text = path.read_text(encoding="utf-8")
    original = text
    marker = "function imageNamesFor(item, exerciseName){const keys="
    replacement = "function imageNamesFor(item, exerciseName){const direct=item?.visual_image;if(direct){const src=String(direct);return [src.startsWith('data:')||src.startsWith('../')||src.startsWith('http')?src:`../${src}`]}const keys="
    if "const direct=item?.visual_image" not in text and marker in text:
        text = text.replace(marker, replacement, 1)
    if text != original:
        path.write_text(text, encoding="utf-8")
    print(rel_path, "changed", text != original)


patch_admin_library()
patch_student_page(Path("student") / "index.html")
patch_student_page(Path("alumno") / "index.html")
