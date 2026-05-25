from pathlib import Path

path = Path('alumno/index.html')
text = path.read_text(encoding='utf-8')
original = text

# Remove global illustrated routine button/toolbar from the routine section.
text = text.replace('<div class="routine-toolbar"><button type="button" class="ghost-action" id="viewFullRoutineBtn">Ver rutina ilustrada completa</button></div>', '')

# Replace helper block: individual toggles only, multiple opened exercises accumulate.
start = text.find('function getExerciseAssetPath(path)')
end = text.find('function videoKey(){')
if start != -1 and end != -1:
    helpers = r'''function getExerciseAssetPath(path){if(!path)return '';return String(path).startsWith('../')?String(path):`../${path}`}function findLibraryExerciseByName(name){const clean=String(name||'').trim().toLowerCase();return exerciseLibrary.find(item=>String(item.name||'').trim().toLowerCase()===clean)||null}async function loadExerciseLibrary(){try{const r=await fetch(`../exercises.json?cache=${Date.now()}`);if(!r.ok)throw new Error('library');const data=await r.json();exerciseLibrary=Array.isArray(data)?data:[]}catch(e){console.error(e);exerciseLibrary=[]}}function renderExerciseVisual(e,index){const libraryItem=findLibraryExerciseByName(e.exercise_name);if(!libraryItem){return `<article class="empty" data-visual-exercise="${index}">${esc(e.exercise_name||'Ejercicio')} todavía no tiene explicación visual cargada en biblioteca.</article>`}return `<article class="card" data-visual-exercise="${index}"><h3>${esc(libraryItem.name)}</h3><p class="muted">${esc(e.sets)} series · ${esc(e.reps_time)} · ${esc(e.load||'sin carga')}</p><div class="exercise-grid">${(libraryItem.steps||[]).slice(0,3).map((step,stepIndex)=>`<article class="exercise-step-card"><img src="${esc(getExerciseAssetPath(step.image))}" alt="${esc(libraryItem.name)} - ${esc(step.title)}"><div class="exercise-step-body"><h3>${stepIndex+1}. ${esc(step.title)}</h3><p>${esc(step.text)}</p></div></article>`).join('')}</div></article>`}function renderRoutineRow(e,i){return `<article class="routine-table-row"><strong>${esc(e.exercise_name||'Ejercicio')}</strong><span>${esc(e.sets||'—')} series</span><span>${esc(e.reps_time||'—')}</span><span>${esc(e.load||'sin carga')}</span><button type="button" class="routine-view-btn" data-view-exercise="${i}" aria-expanded="false">Ver</button></article>`}function toggleRoutineVisual(exercises,index){const panel=$('routineVisualPanel');if(!panel)return;const key=String(index);const existing=panel.querySelector(`[data-visual-exercise="${key}"]`);const btn=document.querySelector(`[data-view-exercise="${key}"]`);if(existing){existing.remove();if(btn){btn.textContent='Ver';btn.setAttribute('aria-expanded','false')}return}panel.insertAdjacentHTML('beforeend',renderExerciseVisual(exercises[Number(index)],Number(index)));if(btn){btn.textContent='Dejar de ver';btn.setAttribute('aria-expanded','true')}panel.querySelector(`[data-visual-exercise="${key}"]`)?.scrollIntoView({behavior:'smooth',block:'start'})}
'''
    text = text[:start] + helpers + text[end:]

# Replace list render binding so every button toggles and no global button exists.
old = "$('routineList').innerHTML=ex.length?ex.map((e,i)=>renderRoutineRow(e,i)).join(''):'<div class=\"empty\">Esta clase todavía no tiene ejercicios cargados.</div>';if($('routineVisualPanel'))$('routineVisualPanel').innerHTML='';document.querySelectorAll('[data-view-exercise]').forEach(btn=>btn.addEventListener('click',()=>showRoutineVisual(ex,btn.dataset.viewExercise)));if($('viewFullRoutineBtn'))$('viewFullRoutineBtn').onclick=()=>showRoutineVisual(ex,null)"
new = "$('routineList').innerHTML=ex.length?ex.map((e,i)=>renderRoutineRow(e,i)).join(''):'<div class=\"empty\">Esta clase todavía no tiene ejercicios cargados.</div>';if($('routineVisualPanel'))$('routineVisualPanel').innerHTML='';document.querySelectorAll('[data-view-exercise]').forEach(btn=>btn.addEventListener('click',()=>toggleRoutineVisual(ex,btn.dataset.viewExercise)))"
text = text.replace(old, new)

# Backward-compatible cleanup if any references survived.
text = text.replace('if($(' + "'viewFullRoutineBtn'" + "))$(' + "'viewFullRoutineBtn'" + ').onclick=()=>showRoutineVisual(ex,null)', '')
text = text.replace('showRoutineVisual(ex,btn.dataset.viewExercise)', 'toggleRoutineVisual(ex,btn.dataset.viewExercise)')

if text != original:
    path.write_text(text, encoding='utf-8')
    print('patched routine toggle visuals')
else:
    print('already patched')
