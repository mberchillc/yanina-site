import json
from pathlib import Path

EXERCISES = [
    ("sentadilla-libre-barra", "Sentadilla libre con barra", "Tren inferior", "Barra", "3", "10"),
    ("sentadilla-hack", "Sentadilla en máquina Hack", "Tren inferior", "Hack Squat", "3", "10"),
    ("sentadilla-smith", "Sentadilla en máquina Smith / Multipower", "Tren inferior", "Máquina Smith", "3", "10"),
    ("prensa-piernas", "Prensa de piernas", "Tren inferior", "Leg Press", "3", "12"),
    ("sentadilla-bulgara", "Sentadilla búlgara", "Tren inferior", "Mancuernas o barra guiada", "3", "10 por pierna"),
    ("zancadas-caminando", "Zancadas caminando", "Tren inferior", "Barra o mancuernas", "3", "10 por pierna"),
    ("zancadas-smith", "Zancadas estáticas en máquina Smith", "Tren inferior", "Máquina Smith", "3", "10 por pierna"),
    ("hip-thrust-barra", "Hip thrust con barra", "Tren inferior", "Banco + barra", "3", "10"),
    ("peso-muerto-rumano", "Peso muerto rumano", "Tren inferior", "Barra o mancuernas", "3", "10"),
    ("extension-cuadriceps", "Extensión de cuádriceps en máquina", "Tren inferior", "Leg Extension", "3", "12"),
    ("curl-piernas", "Curl de piernas en máquina", "Tren inferior", "Máquina tumbada o sentada", "3", "12"),
    ("aductores-abductores", "Aductores / abductores en máquina", "Tren inferior", "Máquina de aductores/abductores", "3", "15"),
    ("elevacion-talones", "Elevación de talones en máquina", "Tren inferior", "Máquina de pantorrillas", "3", "15"),
    ("press-banca", "Press de banca con barra o mancuernas", "Tren superior", "Banco + barra o mancuernas", "3", "10"),
    ("chest-press", "Press de pecho en máquina guiada", "Tren superior", "Chest Press", "3", "10"),
    ("cruces-poleas", "Cruces de poleas para pectoral", "Tren superior", "Poleas / cables", "3", "12"),
    ("press-hombros", "Press de hombros con mancuernas o máquina", "Tren superior", "Mancuernas o máquina", "3", "10"),
    ("vuelos-laterales", "Vuelos laterales", "Tren superior", "Mancuernas o polea baja", "3", "12"),
    ("vuelos-frontales", "Vuelos frontales", "Tren superior", "Mancuernas o barra", "3", "12"),
    ("remo-menton", "Remo al mentón", "Tren superior", "Barra, mancuernas o polea baja", "3", "12"),
    ("jalon-al-pecho", "Polea al pecho / Jalón al pecho", "Tren superior", "Polea alta", "3", "12"),
    ("remo-maquina", "Remo en máquina sentado", "Tren superior", "Máquina con soporte al pecho", "3", "12"),
    ("remo-barra-tbar", "Remo con barra o T-Bar", "Tren superior", "Barra o T-Bar", "3", "10"),
    ("vuelos-posteriores", "Pájaros / vuelos posteriores", "Tren superior", "Mancuernas o Pec Deck invertido", "3", "12"),
    ("dominadas", "Dominadas libres o asistidas", "Tren superior", "Barra o máquina asistida", "3", "8-10"),
    ("curl-biceps", "Curl de bíceps con barra o mancuernas", "Tren superior", "Barra recta/Z o mancuernas", "3", "12"),
    ("curl-scott", "Curl de bíceps en banco Scott", "Tren superior", "Banco Scott / predicador", "3", "12"),
    ("curl-polea-baja", "Curl de bíceps en polea baja", "Tren superior", "Polea baja", "3", "12"),
    ("triceps-polea", "Extensión de tríceps en polea alta", "Tren superior", "Polea alta con cuerda o barra", "3", "12"),
    ("fondos-paralelas", "Fondos en paralelas", "Tren superior", "Paralelas o máquina asistida", "3", "8-10"),
    ("press-frances", "Press francés con barra Z", "Tren superior", "Barra Z", "3", "10"),
    ("press-pallof", "Press Pallof", "Core", "Torre de poleas", "3", "12 por lado"),
    ("plancha-abdominal", "Plancha abdominal tradicional", "Core", "Mat", "3", "30 segundos"),
    ("plancha-lateral", "Plancha lateral", "Core", "Mat", "3", "20-30 segundos por lado"),
    ("hollow-body-hold", "Hollow Body Hold", "Core", "Mat", "3", "20-30 segundos"),
    ("crunch-polea", "Crunch abdominal en polea alta", "Core", "Polea alta", "3", "12"),
    ("crunch-maquina", "Crunch en máquina de abdomen", "Core", "Máquina abdominal", "3", "12"),
    ("elevaciones-piernas-colgado", "Elevaciones de piernas colgado", "Core", "Barra o silla de capitán", "3", "10"),
    ("giros-rusos", "Giros rusos", "Core", "Disco o balón medicinal", "3", "20 alternados"),
    ("plancha-spiderman", "Plancha Spiderman", "Core", "Mat", "3", "10 por lado"),
]

SPECIFIC_STEPS = {
    "sentadilla-libre-barra": [
        ("Inicio", "Ubicá la barra firme, pies al ancho de hombros y abdomen activo antes de iniciar."),
        ("Descenso", "Descendé con control llevando la cadera atrás y manteniendo rodillas alineadas con los pies."),
        ("Subida", "Empujá el suelo para subir, activando piernas y glúteos sin perder la postura."),
    ],
    "prensa-piernas": [
        ("Inicio", "Apoyá toda la espalda en el respaldo y ubicá los pies firmes sobre la plataforma."),
        ("Flexión", "Bajá la plataforma con control, llevando rodillas hacia el pecho sin despegar la pelvis."),
        ("Empuje", "Empujá desde talones y mediopié hasta extender sin trabar completamente las rodillas."),
    ],
    "hip-thrust-barra": [
        ("Apoyo", "Apoyá la parte alta de la espalda en el banco, pies firmes y barra sobre la cadera."),
        ("Elevación", "Elevá la cadera activando glúteos, con mentón levemente hacia adentro y abdomen firme."),
        ("Control", "Bajá lento sin perder tensión y repetí evitando arquear de más la zona lumbar."),
    ],
    "jalon-al-pecho": [
        ("Inicio", "Sentate estable, tomá la barra con agarre cómodo y mantené hombros lejos de las orejas."),
        ("Tracción", "Llevá la barra hacia el pecho, activando espalda y acercando codos al torso."),
        ("Regreso", "Volvé con control hasta extender brazos sin soltar la postura ni elevar hombros."),
    ],
    "plancha-abdominal": [
        ("Apoyo", "Apoyá antebrazos y puntas de pies, con codos debajo de hombros."),
        ("Alineación", "Mantené cabeza, espalda y cadera en una línea, abdomen activo y glúteos firmes."),
        ("Sostén", "Respirá sin perder postura. Si aparece dolor lumbar, bajá rodillas y avisá a Yanina."),
    ],
}


def generic_steps(name, category):
    if category == "Core":
        return [
            ("Inicio", f"Prepará la posición de {name}, con abdomen activo, respiración controlada y cuello relajado."),
            ("Ejecución", "Realizá el movimiento o sostén indicado sin perder alineación de columna, cadera y hombros."),
            ("Control", "Mantené la tensión abdominal hasta terminar la repetición o el tiempo indicado, sin compensar con lumbar."),
        ]
    if category == "Tren inferior":
        return [
            ("Inicio", f"Prepará {name} con pies firmes, abdomen activo y postura estable antes de iniciar."),
            ("Ejecución", "Mové cadera y rodillas con control, manteniendo alineación de pies, rodillas y torso."),
            ("Control", "Volvé a la posición inicial empujando desde el suelo y sosteniendo la técnica en todo el recorrido."),
        ]
    return [
        ("Inicio", f"Prepará {name} con agarre cómodo, hombros estables y abdomen activo."),
        ("Ejecución", "Mové la carga con control, activando el grupo muscular indicado y evitando impulsos."),
        ("Control", "Regresá lentamente a la posición inicial, sin perder postura ni tensión."),
    ]


def image_for(exercise_id, step_number):
    if exercise_id == "sentadilla-libre-barra":
        return f"assets/ejercicio-sentadilla-banco-{step_number}.png?v=steps-2"
    return f"assets/icono-ejercicio-{step_number}.png?v=icons-2"

library = []
for exercise_id, name, category, equipment, default_sets, default_reps in EXERCISES:
    steps = SPECIFIC_STEPS.get(exercise_id) or generic_steps(name, category)
    library.append({
        "id": exercise_id,
        "name": name,
        "category": category,
        "equipment": equipment,
        "default_sets": default_sets,
        "default_reps": default_reps,
        "default_load": "—",
        "steps": [
            {"title": title, "text": text, "image": image_for(exercise_id, index)}
            for index, (title, text) in enumerate(steps, start=1)
        ],
    })

Path("exercises.json").write_text(json.dumps(library, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {len(library)} exercises")
