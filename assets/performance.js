(() => {
  'use strict';
  const access=window.YaninaAccess,$=id=>document.getElementById(id);
  const number=value=>Number(value).toLocaleString('es-AR',{timeZone:'America/New_York'});
  let latest=null,loading=false;
  if(!access?.active()){location.replace('/superadmin/');return;}
  const labels={class:'Clase cargada',calendar_class:'Clase del calendario',routine:'Rutina cargada',message:'Mensaje intercambiado',image:'Imagen vinculada',video:'Video vinculado',session:'Sesión detectada'};
  function capacity(){
    if(!latest)return;
    const input=Number($('requestsPerUser').value);
    if(!Number.isFinite(input)||input<1||input>10000){$('capacityResult').textContent='—';$('capacity').textContent='—';return;}
    const estimate=Math.floor(latest.capacity.reference_daily_requests/input);
    $('capacity').textContent='≈ '+number(estimate);$('capacityResult').textContent='≈ '+number(estimate);
  }
  function chart(data){
    const days=Array.from({length:30},()=>({calendar_class:0,routine:0,message:0}));
    data.daily.forEach(row=>{if(days[row.day]&&row.kind in days[row.day])days[row.day][row.kind]=Number(row.count);});
    const maximum=Math.max(1,...days.map(day=>day.calendar_class+day.routine+day.message));
    const fragment=document.createDocumentFragment();
    days.forEach((day,index)=>{
      const date=new Date(new Date(data.period.from).getTime()+(index+1)*86400000);
      const bar=document.createElement('div');bar.className='chart-bar';
      bar.title='24 h hasta '+date.toLocaleDateString('es-AR',{timeZone:'America/New_York'})+': '+day.calendar_class+' clases · '+day.routine+' rutinas · '+day.message+' mensajes';
      [['message','message'],['routine','routine'],['calendar_class','calendar']].forEach(([key,cls])=>{const segment=document.createElement('span');segment.className=cls;segment.style.height=(day[key]/maximum*100)+'%';bar.append(segment);});
      if([0,7,14,21,29].includes(index)){const label=document.createElement('small');label.className='chart-label';label.textContent=date.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',timeZone:'America/New_York'});if(index===29)label.style.right='0';bar.append(label);}
      fragment.append(bar);
    });
    $('chart').replaceChildren(fragment);
    if(!days.some(day=>day.calendar_class+day.routine+day.message)){const empty=document.createElement('div');empty.className='chart-empty';empty.textContent='Sin clases, rutinas ni mensajes registrados en este período.';$('chart').append(empty);}
    $('chart').setAttribute('aria-label','Actividad diaria de los últimos 30 días. Pasá el cursor sobre cada día para ver cantidades.');
  }
  function recent(items){
    $('recent').replaceChildren();
    if(!items.length){const li=document.createElement('li');li.textContent='Sin movimientos registrados en los últimos 30 días.';$('recent').append(li);return;}
    items.forEach(item=>{const li=document.createElement('li'),dot=document.createElement('i'),wrap=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('small');dot.className='event-dot';title.textContent=labels[item.kind]||'Actividad registrada';const date=new Date(item.at.includes('T')?item.at:item.at.replace(' ','T')+'Z');detail.textContent=item.kind==='calendar_class' ? new Date(item.at.slice(0,10)+'T12:00:00Z').toLocaleDateString('es-AR',{day:'2-digit',month:'short',timeZone:'America/New_York'}) : date.toLocaleString('es-AR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'America/New_York'})+' · '+(['admin','trainer'].includes(item.role)?'Yanina':'Alumno/a');wrap.append(title,detail);li.append(dot,wrap);$('recent').append(li);});
  }
  async function refresh(){
    if(loading)return;loading=true;$('refresh').disabled=true;$('error').textContent='';
    try{
      const data=await access.api('performance');latest=data;
      ['classes','open_sessions','routines','messages','images','videos','active_students'].forEach(id=>$(id).textContent=number(data.metrics[id]));
      $('classDetail').textContent='Creadas en 30 días · '+number(data.metrics.calendar_classes)+' clases en el calendario del período';
      $('sessionDetail').textContent='Actividad en 15 min · '+number(data.metrics.observed_sessions)+' sesiones detectadas en el período';
      $('studentDetail').textContent='Con actividad en 30 días · '+number(data.metrics.registered_students)+' perfiles registrados en total';
      const format=date=>new Date(date).toLocaleDateString('es-AR',{day:'2-digit',month:'short',year:'numeric',timeZone:'America/New_York'});
      $('period').textContent=format(data.period.from)+' — '+format(data.period.to)+' · Ventana móvil de 30 días';
      $('sessionCoverage').textContent='Medición de sesiones habilitada el '+new Date(data.sessions_measured_since).toLocaleString('es-AR')+'.';
      $('updated').textContent='Actualizado '+new Date(data.period.to).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',timeZone:'America/New_York'});
      chart(data);recent(data.recent);capacity();
      try{const response=await fetch('/exercises.json',{cache:'no-store'});if(!response.ok)throw new Error();const library=await response.json();if(!Array.isArray(library))throw new Error();$('library').textContent=number(library.length);}catch{$('library').textContent='Sin datos';}
    }catch(error){$('error').textContent=error.message||'No se pudo cargar el dashboard.';}
    finally{loading=false;$('refresh').disabled=false;}
  }
  $('logoutBtn').addEventListener('click',access.logout);$('refresh').addEventListener('click',refresh);$('requestsPerUser').addEventListener('input',capacity);
  refresh();setInterval(()=>{if(document.visibilityState==='visible')refresh();},60000);
})();

