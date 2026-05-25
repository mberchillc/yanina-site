from pathlib import Path

path = Path('alumno/index.html')
text = path.read_text(encoding='utf-8')
original = text

# Re-run marker: allow student view by id/studentId URL parameter.
old = "const API_BASE='https://yanina-trainer-api.mberchillc.workers.dev';const STUDENT_ID='6';let exerciseLibrary=[];let classes=[];let selectedId=null;let pendingVideoFile=null;"
new = "const API_BASE='https://yanina-trainer-api.mberchillc.workers.dev';const pageParams=new URLSearchParams(window.location.search);const sessionData=JSON.parse(localStorage.getItem('yaninaStudentSession')||'{}');const STUDENT_ID=String(pageParams.get('id')||pageParams.get('studentId')||sessionData.studentId||'6');let exerciseLibrary=[];let classes=[];let selectedId=null;let pendingVideoFile=null;"
text = text.replace(old, new)
text = text.replace('Esta vista muestra sólo la información asociada a Marcela.S: ficha, calendario, rutinas, ejercicios, mediciones e indicaciones de Yanina.', 'Esta vista muestra la ficha, calendario, rutinas, ejercicios, mediciones e indicaciones cargadas por Yanina.')

if text != original:
    path.write_text(text, encoding='utf-8')
    print('patched dynamic student id')
else:
    print('already patched')
