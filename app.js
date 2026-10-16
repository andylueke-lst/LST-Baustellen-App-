'use strict';
const $=s=>document.querySelector(s), canvas=$('#signature'),ctx=canvas.getContext('2d'),status=$('#status');
const DB_NAME='lst-baustellen-test-v02',STORE='reports';let db,currentId=null,activePointer=null;
const say=t=>status.textContent=t;
function setupCanvas(){const width=canvas.clientWidth,height=190,dpr=window.devicePixelRatio||1;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.lineWidth=2.3;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#132c41';}
setupCanvas();
function clearSign(){ctx.clearRect(0,0,canvas.clientWidth,190)}
function setSign(data){clearSign();if(!data)return;const img=new Image();img.onload=()=>{clearSign();ctx.drawImage(img,0,0,canvas.clientWidth,190)};img.src=data;}
function pos(e){const r=canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top]}
function allowed(e){return $('input[name="signmode"]:checked').value==='both'||e.pointerType==='pen'}
canvas.addEventListener('pointerdown',e=>{if(activePointer!==null||!allowed(e))return;activePointer=e.pointerId;e.preventDefault();canvas.setPointerCapture(e.pointerId);const [x,y]=pos(e);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+.01,y+.01);ctx.stroke()});
canvas.addEventListener('pointermove',e=>{if(e.pointerId!==activePointer)return;e.preventDefault();const [x,y]=pos(e);ctx.lineTo(x,y);ctx.stroke()});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,e=>{if(e.pointerId===activePointer)activePointer=null});
$('#clear').onclick=()=>{clearSign();say('Unterschrift gelöscht – zum Behalten Bericht speichern.')};
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{req.result.createObjectStore(STORE,{keyPath:'id'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function transaction(mode,action){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);let result;const request=action(store);request.onsuccess=()=>{result=request.result};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}

const TIME_KEYS=[['departOffice','Abfahrt Büro / Arbeitszeitbeginn'],['arriveCustomer','Ankunft Kunde / Auftragszeitbeginn'],['leaveCustomer','Abfahrt Kunde / Auftragszeitende'],['arriveOffice','Ankunft Büro / Arbeitszeitende']];
for(const [key,label] of TIME_KEYS){const wrap=document.createElement('div');wrap.className='time-entry';const l=document.createElement('label');l.htmlFor=key;l.textContent=label;const r=document.createElement('div');r.className='row';const inp=document.createElement('input');inp.type='datetime-local';inp.id=key;inp.setAttribute('aria-label',label);inp.addEventListener('change',calculate);const btn=document.createElement('button');btn.type='button';btn.className='secondary';btn.textContent='Jetzt übernehmen';btn.onclick=()=>{const now=new Date();inp.value=localDatetime(now);calculate()};r.append(inp,btn);wrap.append(l,r);$('#timeFields').append(wrap)}
function localDatetime(d){const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`}
function minutesBetween(a,b){if(!a||!b)return null;const x=new Date(a).getTime(),y=new Date(b).getTime();return Number.isFinite(x)&&Number.isFinite(y)?Math.round((y-x)/60000):null}
function duration(min){if(min===null)return '–';if(min<0)return 'Ungültige Reihenfolge';return `${Math.floor(min/60)} h ${String(min%60).padStart(2,'0')} min`}
function parseMeter(v){if(!v.trim())return null;const norm=v.trim().replace(/\s/g,'').replace(',','.');if(!/^\d+(?:\.\d{1,2})?$/.test(norm))return NaN;return Math.round(Number(norm)*100)}
function calculate(){const times=Object.fromEntries(TIME_KEYS.map(([k])=>[k,$('#'+k).value]));const travel1=minutesBetween(times.departOffice,times.arriveCustomer),onsite=minutesBetween(times.arriveCustomer,times.leaveCustomer),travel2=minutesBetween(times.leaveCustomer,times.arriveOffice),total=minutesBetween(times.departOffice,times.arriveOffice);const bad=[travel1,onsite,travel2,total].some(v=>v!==null&&v<0);$('#timeSummary').className='hint'+(bad?' invalid':'');$('#timeSummary').textContent=`Hinfahrt: ${duration(travel1)} · Vor Ort: ${duration(onsite)} · Rückfahrt: ${duration(travel2)} · Gesamt: ${duration(total)}`+(bad?' – Bitte Eingaben prüfen.':'');const m1=parseMeter($('#meterStart').value),m2=parseMeter($('#meterEnd').value);let msg='Noch keine vollständigen Zählerstände.',error=false;if(Number.isNaN(m1)||Number.isNaN(m2)){msg='Bitte Zählerstände mit maximal zwei Nachkommastellen eingeben.';error=true}else if(m1!==null&&m2!==null){if(m2<m1){msg='Endstand darf nicht kleiner als Anfangsstand sein.';error=true}else{msg=`Kompressorlaufzeit: ${((m2-m1)/100).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})} h`}}$('#meterSummary').textContent=msg;$('#meterSummary').className='hint'+(error?' invalid':'');return !bad&&!error}
for(const id of ['meterStart','meterEnd'])$('#'+id).addEventListener('input',calculate);
function readExtra(){return {people:$('#people').value,times:Object.fromEntries(TIME_KEYS.map(([k])=>[k,$('#'+k).value])),meterStart:$('#meterStart').value,meterEnd:$('#meterEnd').value}}
function writeExtra(d={}){$('#people').value=d.people||'1';for(const [k] of TIME_KEYS)$('#'+k).value=d.times?.[k]||'';$('#meterStart').value=d.meterStart||'';$('#meterEnd').value=d.meterEnd||'';calculate()}

const all=()=>transaction('readonly',s=>s.getAll());const get=id=>transaction('readonly',s=>s.get(id));const put=data=>transaction('readwrite',s=>s.put(data));const remove=id=>transaction('readwrite',s=>s.delete(id));
function fresh(){currentId=null;$('#project').value='';$('#day').value=new Date().toLocaleDateString('en-CA');$('#report').value='';writeExtra();clearSign();$('#reports').selectedIndex=-1;say('Neuer Bericht – noch nicht gespeichert')}
$('#new').onclick=fresh;
async function refresh(selectId){const list=(await all()).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));const sel=$('#reports');sel.replaceChildren();for(const r of list){const opt=document.createElement('option');opt.value=r.id;opt.textContent=`${r.project||'Ohne Auftrag'} – ${r.day||'ohne Datum'} (${new Date(r.updatedAt).toLocaleString('de-DE')})`;sel.append(opt)}sel.selectedIndex=-1;if(selectId)sel.value=selectId;}
async function loadId(id){const data=await get(id);if(!data){say('Bericht nicht gefunden');return}currentId=data.id;$('#project').value=data.project||'';$('#day').value=data.day||'';$('#report').value=data.report||'';writeExtra(data);setSign(data.signature);$('#reports').value=id;say('Entwurf geladen und bearbeitbar. Änderungen mit „Bericht lokal speichern“ übernehmen. Zuletzt gespeichert: '+new Date(data.updatedAt).toLocaleString('de-DE'))}
$('#load').onclick=async()=>{try{const id=$('#reports').value;if(!id){say('Bitte einen Bericht auswählen');return}await loadId(id)}catch(e){say('Laden fehlgeschlagen: '+e.message)}};
$('#save').onclick=async()=>{try{if(!calculate()){say('Bitte ungültige Zeit- oder Zählerstände korrigieren.');return}const id=currentId||crypto.randomUUID(),now=new Date().toISOString();const old=currentId?await get(currentId):null;await put({id,project:$('#project').value.trim(),day:$('#day').value,report:$('#report').value,...readExtra(),signature:canvas.toDataURL('image/png'),createdAt:old?.createdAt||now,updatedAt:now});currentId=id;await refresh(id);say((old?'Änderungen gespeichert: ':'Neuer Bericht gespeichert: ')+new Date().toLocaleString('de-DE'))}catch(e){say('Speichern fehlgeschlagen: '+e.message)}};
$('#delete').onclick=async()=>{const id=$('#reports').value;if(!id){say('Bitte einen Bericht auswählen');return}if(!confirm('Ausgewählten Testbericht wirklich löschen?'))return;try{await remove(id);if(currentId===id)fresh();await refresh();say('Bericht gelöscht')}catch(e){say('Löschen fehlgeschlagen: '+e.message)}};
const escapeHtml=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function showEditor(){ $('#preview').classList.remove('visible');$('#editor').classList.remove('hidden');window.scrollTo(0,0); }
function showPreview(){
 const box=$('#printContent');box.replaceChildren();
 const title=document.createElement('h1');title.textContent='LST Testbericht';box.append(title);
 const project=document.createElement('p');project.textContent='Auftrag: '+$('#project').value;box.append(project);
 const day=document.createElement('p');day.textContent='Datum: '+$('#day').value;box.append(day);
 const heading=document.createElement('h2');heading.textContent='Bericht';box.append(heading);
 const report=document.createElement('p');report.textContent=$('#report').value;box.append(report);
 const timeHeading=document.createElement('h2');timeHeading.textContent='Zeiten und Kompressor';box.append(timeHeading);const ex=readExtra();const persons=document.createElement('p');persons.textContent='Teamgröße: '+(ex.people||'–');box.append(persons);for(const [k,label] of TIME_KEYS){const el=document.createElement('p');el.textContent=label+': '+(ex.times[k]||'–').replace('T',' ');box.append(el)}const meter=document.createElement('p');meter.textContent='Betriebsstunden Beginn / Ende: '+(ex.meterStart||'–')+' / '+(ex.meterEnd||'–');box.append(meter);const ms=parseMeter(ex.meterStart),me=parseMeter(ex.meterEnd);if(ms!==null&&me!==null&&Number.isFinite(ms)&&Number.isFinite(me)&&me>=ms){const delta=document.createElement('p');delta.textContent='Kompressorlaufzeit: '+((me-ms)/100).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' h';box.append(delta)}
 const signHeading=document.createElement('h2');signHeading.textContent='Unterschrift';box.append(signHeading);
 const img=document.createElement('img');img.alt='Unterschrift';img.src=canvas.toDataURL('image/png');box.append(img);
 const note=document.createElement('p');note.textContent='TESTDOKUMENT – kein Kundenbeleg';box.append(note);
 $('#editor').classList.add('hidden');$('#preview').classList.add('visible');window.scrollTo(0,0);
}
$('#pdf').onclick=showPreview;
$('#back').onclick=showEditor;
$('#print').onclick=()=>window.print();
window.addEventListener('afterprint',()=>{ /* Vorschau bleibt mit sichtbarem Zurück-Button geöffnet */ });
async function migrateOld(){const old=localStorage.getItem('lst-pwa-test');if(!old||localStorage.getItem('lst-v02-migrated'))return;try{const d=JSON.parse(old);const now=new Date().toISOString();await put({id:crypto.randomUUID(),project:'Übernommener Test aus Version 0.1',day:(d.savedAt||now).slice(0,10),report:d.report||'',signature:d.signature||'',createdAt:d.savedAt||now,updatedAt:now});localStorage.setItem('lst-v02-migrated','1')}catch(e){say('Übernahme alter Testdaten nicht möglich: '+e.message)}}
(async()=>{try{db=await openDb();await migrateOld();await refresh();fresh();say('Bereit – Berichte werden getrennt gespeichert.')}catch(e){say('Lokaler Speicher nicht verfügbar: '+e.message);$('#save').disabled=true}})();
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(e=>say('Offline-Installation fehlgeschlagen: '+e.message));
