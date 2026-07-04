import json
from pathlib import Path
from urllib.parse import quote
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "exercises.json"

EXERCISES = [
    ("sentadilla", "Sentadilla", "Tren inferior", "Peso corporal o mancuerna", "3", "10 a 15 reps", "Libre", [("Inicio", "Pies al ancho de caderas, pecho abierto y abdomen activo."), ("Descenso", "Flexioná cadera y rodillas llevando la cola hacia atrás."), ("Final", "Subí empujando el piso y mantené rodillas alineadas.")]),
    ("sentadilla-isometrica-pared", "Sentadilla isométrica en pared", "Tren inferior", "Pared", "3", "20 a 40 seg", "Peso corporal", [("Inicio", "Apoyá espalda contra la pared y separá los pies."), ("Sostén", "Bajá hasta formar un ángulo cómodo con las rodillas."), ("Final", "Mantené el abdomen activo y subí controlado.")]),
    ("sentadilla-sumo", "Sentadilla sumo", "Tren inferior", "Peso corporal, mancuerna o kettlebell", "3", "10 a 15 reps", "Libre", [("Inicio", "Abrí la base de pies y orientá puntas levemente afuera."), ("Descenso", "Bajá con rodillas siguiendo la línea de los pies."), ("Final", "Subí apretando glúteos sin cerrar las rodillas.")]),
    ("zancada", "Zancada", "Tren inferior", "Peso corporal o mancuernas", "3", "8 a 12 por pierna", "Libre", [("Inicio", "Parate firme, abdomen activo y mirada al frente."), ("Paso", "Llevá una pierna atrás o adelante y bajá controlado."), ("Final", "Empujá con la pierna de apoyo y cambiá de lado.")]),
    ("patada-gluteo-banda-tobillera", "Patada de glúteo con banda o tobilleras", "Tren inferior", "Banda, tobillera o polea baja", "3", "12 a 15 por pierna", "Banda o tobillera", [("Inicio", "Apoyá manos o antebrazos y fijá la banda o tobillera."), ("Patada", "Extendé la pierna hacia atrás sin arquear la cintura."), ("Final", "Volvé lento manteniendo tensión en el glúteo.")]),
    ("abduccion-banda-tobillera", "Abducción con banda o tobillera", "Tren inferior", "Banda, tobillera o polea baja", "3", "12 a 15 por pierna", "Banda o tobillera", [("Inicio", "Parate firme con apoyo y tensión suave en la banda."), ("Apertura", "Separá la pierna hacia afuera sin inclinar el torso."), ("Final", "Regresá controlado sin perder alineación de cadera.")]),
    ("peso-muerto-1-pierna", "Peso muerto a 1 pierna", "Tren inferior", "Peso corporal, mancuerna o kettlebell", "3", "8 a 12 por pierna", "Libre", [("Inicio", "Apoyá una pierna y sostené la carga cerca del cuerpo."), ("Bisagra", "Llevá cadera atrás mientras la pierna libre acompaña."), ("Final", "Volvé al centro con espalda larga y control.")]),
    ("elevacion-gemelos", "Elevación de gemelos", "Tren inferior", "Peso corporal, mancuernas o escalón", "3", "12 a 20 reps", "Libre", [("Inicio", "Parate con pies paralelos y talones apoyados."), ("Elevación", "Subí talones hasta quedar en puntas de pie."), ("Final", "Bajá lento, buscando rango completo sin rebote.")]),
    ("remo-mancuerna-1-brazo", "Remo con mancuerna a 1 brazo", "Tren superior", "Mancuerna y banco o apoyo", "3", "10 a 12 por brazo", "Mancuerna", [("Inicio", "Apoyá una mano, espalda larga y mancuerna debajo del hombro."), ("Remo", "Llevá el codo hacia atrás cerca del cuerpo."), ("Final", "Bajá la mancuerna controlada sin rotar el torso.")]),
    ("extensiones-triceps", "Extensiones de tríceps", "Tren superior", "Mancuerna, banda o polea", "3", "10 a 15 reps", "Libre", [("Inicio", "Brazos flexionados y codos estables cerca de la cabeza o torso."), ("Extensión", "Extendé los codos sin mover los hombros."), ("Final", "Volvé lento manteniendo tensión en tríceps.")]),
    ("crunch", "Crunch", "Core", "Colchoneta", "3", "12 a 20 reps", "Peso corporal", [("Inicio", "Acostate boca arriba con rodillas flexionadas."), ("Contracción", "Elevá hombros activando abdomen, sin tirar del cuello."), ("Final", "Bajá lento manteniendo zona lumbar estable.")]),
    ("oblicuo-codo-rodilla", "Oblicuo codo-rodilla", "Core", "Colchoneta", "3", "10 a 16 por lado", "Peso corporal", [("Inicio", "Acostate con manos suaves detrás de la cabeza."), ("Cruce", "Acercá codo y rodilla contraria rotando el torso."), ("Final", "Alterná lados con control y respiración constante.")]),
    ("up-down-plancha", "Up-down plancha", "Core", "Colchoneta", "3", "20 a 40 seg", "Peso corporal", [("Inicio", "Arrancá en plancha alta con cuerpo alineado."), ("Bajada", "Apoyá un antebrazo y luego el otro sin balancear caderas."), ("Final", "Volvé a manos alternando el brazo inicial.")]),
    ("burpees", "Burpees", "Cardio", "Peso corporal", "3", "8 a 12 reps", "Peso corporal", [("Inicio", "Parate firme con pies al ancho de caderas."), ("Suelo", "Llevá manos al piso y extendé piernas a plancha."), ("Final", "Volvé con pies hacia manos y saltá o extendé arriba.")]),
    ("jumping-jacks", "Jumping jacks", "Cardio", "Peso corporal", "3", "30 a 45 seg", "Peso corporal", [("Inicio", "Parate con brazos al costado y pies juntos."), ("Apertura", "Saltá abriendo pies y elevando brazos."), ("Final", "Cerrá pies y brazos con ritmo continuo.")]),
    ("escaladores", "Escaladores", "Cardio", "Colchoneta", "3", "20 a 40 seg", "Peso corporal", [("Inicio", "Ubicate en plancha alta con hombros sobre manos."), ("Rodilla", "Llevá una rodilla hacia el pecho sin subir cadera."), ("Final", "Alterná piernas con ritmo y abdomen firme.")]),
]


def pose(index, cx):
    head_y = [92, 82, 92][index]
    hip_y = [150, 158, 150][index]
    leg_a = [(cx - 38, 198), (cx - 58, 198), (cx - 34, 198)][index]
    leg_b = [(cx + 38, 198), (cx + 56, 176), (cx + 34, 198)][index]
    arm_a = [(cx - 42, 144), (cx - 58, 128), (cx - 34, 124)][index]
    arm_b = [(cx + 42, 144), (cx + 58, 128), (cx + 34, 124)][index]
    return f'''<circle cx="{cx}" cy="{head_y}" r="14" fill="#eef7ea" stroke="#73ad13" stroke-width="6"/>
      <line x1="{cx}" y1="{head_y + 17}" x2="{cx}" y2="{hip_y}" stroke="#73ad13" stroke-width="8" stroke-linecap="round"/>
      <path d="M{cx} {hip_y} L{leg_a[0]} {leg_a[1]} M{cx} {hip_y} L{leg_b[0]} {leg_b[1]}" stroke="#73ad13" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M{cx} {head_y + 48} L{arm_a[0]} {arm_a[1]} M{cx} {head_y + 48} L{arm_b[0]} {arm_b[1]}" stroke="#73ad13" stroke-width="7" stroke-linecap="round"/>'''


def visual_data_uri(name, steps):
    cards = []
    for index, (title, text) in enumerate(steps):
        left = 16 + index * 274
        cx = left + 115
        safe_title = escape(title)
        safe_text = escape(text)
        cards.append(f'''<g>
          <rect x="{left}" y="22" width="230" height="248" rx="18" fill="#ffffff" stroke="#dfead9" stroke-width="2"/>
          <text x="{left + 20}" y="58" font-size="22" font-weight="800" fill="#18223d">{safe_title}</text>
          <rect x="{left + 20}" y="76" width="190" height="132" rx="18" fill="#eef7ea"/>
          {pose(index, cx)}
          <text x="{left + 20}" y="234" font-size="12" font-weight="700" fill="#5e6d7a">{safe_text[:44]}</text>
          <text x="{left + 20}" y="250" font-size="12" font-weight="700" fill="#5e6d7a">{safe_text[44:88]}</text>
        </g>''')
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="850" height="292" viewBox="0 0 850 292">
      <rect width="850" height="292" rx="22" fill="#ffffff"/>
      <text x="24" y="24" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="800" fill="#144234">YANINA TRAINER</text>
      <text x="226" y="24" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="800" fill="#18223d">{escape(name)}</text>
      <g font-family="Inter, Arial, sans-serif">{''.join(cards)}</g>
    </svg>'''
    return "data:image/svg+xml;charset=UTF-8," + quote(svg)


def build_entry(raw):
    ex_id, name, category, equipment, sets, reps, load, steps = raw
    return {
        "id": ex_id,
        "name": name,
        "category": category,
        "equipment": equipment,
        "default_sets": sets,
        "default_reps": reps,
        "default_load": load,
        "visual_image": visual_data_uri(name, steps),
        "steps": [
            {"title": title, "text": text, "image": f"assets/icono-ejercicio-{index + 1}.png?v=icons-2"}
            for index, (title, text) in enumerate(steps)
        ],
    }


def main():
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    by_id = {item.get("id"): item for item in data}
    for raw in EXERCISES:
        entry = build_entry(raw)
        if entry["id"] in by_id:
            by_id[entry["id"]].update(entry)
        else:
            data.append(entry)
            by_id[entry["id"]] = entry

    triceps = by_id.get("triceps-polea")
    if triceps:
        triceps["visual_image"] = "assets/exercises/triceps-polea.png?v=student-shared-1"
        for step in triceps.get("steps", []):
            step["image"] = "assets/exercises/triceps-polea.png?v=student-shared-1"

    JSON_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
