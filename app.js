'use strict';
const $=s=>document.querySelector(s), canvas=$('#signature'),ctx=canvas.getContext('2d'),status=$('#status');
const DB_NAME='lst-baustellen-test-v02',STORE='reports',METERS='compressorMeters',ATLAS='atlas-xahs-186-dd';let db,currentId=null,activePointer=null,loadedData={},proposalToken=0,suggestedStart='';
let sourcePdf=null,pdfSelectionToken=0,preparedPdf=null,pdfRevision=0,choicesToken=0;let choicesContext='';
const CUSTOMER_KEYS=['foreman','worker','abrasive','abrasiveOther','abrasiveKg','airSetting','mediaSetting','nozzle','signerName','signedDay','lstEmail','customerEmail'];
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
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,2);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'});if(!req.result.objectStoreNames.contains(METERS))req.result.createObjectStore(METERS,{keyPath:'id'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function transaction(mode,action){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);let result;const request=action(store);request.onsuccess=()=>{result=request.result};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}

const TIME_KEYS=[['departOffice','Abfahrt Büro / Arbeitszeitbeginn'],['arriveCustomer','Ankunft Kunde / Auftragszeitbeginn'],['leaveCustomer','Abfahrt Kunde / Auftragszeitende'],['arriveOffice','Ankunft Büro / Arbeitszeitende']];
for(const [key,label] of TIME_KEYS){
 const wrap=document.createElement('div');wrap.className='time-entry';
 const l=document.createElement('label');l.htmlFor=key+'Time';l.textContent=label;
 const row=document.createElement('div');row.className='row';
 const value=document.createElement('input');value.type='hidden';value.id=key;
 const date=document.createElement('input');date.type='date';date.id=key+'Date';date.setAttribute('aria-label',label+' Datum');
 const time=document.createElement('input');time.type='time';time.step='900';time.id=key+'Time';time.setAttribute('aria-label',label+' Uhrzeit');
 const sync=()=>{value.value=date.value&&time.value?date.value+'T'+time.value:'';calculate()};
 date.onchange=sync;time.oninput=()=>{if(!date.value)date.value=$('#day').value;sync()};
 const mode=document.createElement('button');mode.type='button';mode.className='secondary';mode.textContent='Tastatur / Pencil';mode.setAttribute('aria-pressed','false');
 mode.onclick=()=>{const v=time.value;const text=time.type==='time';time.type=text?'text':'time';time.value=v;time.inputMode='text';time.placeholder='07:15';mode.textContent=text?'Zeitauswahl':'Tastatur / Pencil';mode.setAttribute('aria-pressed',String(text));time.focus()};
 const now=document.createElement('button');now.type='button';now.className='secondary';now.textContent='Jetzt (¼ h)';now.onclick=()=>{const d=new Date();d.setMinutes(Math.round(d.getMinutes()/15)*15,0,0);setTime(key,localDatetime(d));calculate()};
 row.append(date,time,mode,now);wrap.append(l,value,row);$('#timeFields').append(wrap);
}
function setTime(key,value){$('#'+key).value=value;$('#'+key+'Date').value=value.split('T')[0]||'';$('#'+key+'Time').value=value.split('T')[1]||''}
function timeErrors(){return TIME_KEYS.some(([k])=>{const d=$('#'+k+'Date').value,t=$('#'+k+'Time').value,v=$('#'+k).value;if(!d&&!t)return false;if(!d||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))return true;return Number(t.slice(3))%15!==0&&v!==loadedData.times?.[k]})}
function localDatetime(d){const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`}
function minutesBetween(a,b){if(!a||!b)return null;const x=new Date(a).getTime(),y=new Date(b).getTime();return Number.isFinite(x)&&Number.isFinite(y)?Math.round((y-x)/60000):null}
function duration(min){if(min===null)return '–';if(min<0)return 'Ungültige Reihenfolge';return `${Math.floor(min/60)} h ${String(min%60).padStart(2,'0')} min`}
function parseMeter(v){if(!v.trim())return null;const norm=v.trim().replace(/\s/g,'').replace(',','.');if(!/^\d+(?:\.\d{1,2})?$/.test(norm))return NaN;return Math.round(Number(norm)*100)}
function calculate(){const times=Object.fromEntries(TIME_KEYS.map(([k])=>[k,$('#'+k).value]));const travel1=minutesBetween(times.departOffice,times.arriveCustomer),onsite=minutesBetween(times.arriveCustomer,times.leaveCustomer),travel2=minutesBetween(times.leaveCustomer,times.arriveOffice),total=minutesBetween(times.departOffice,times.arriveOffice);const bad=timeErrors()||[travel1,onsite,travel2,total].some(v=>v!==null&&v<0);$('#timeSummary').className='hint'+(bad?' invalid':'');$('#timeSummary').textContent=`Hinfahrt: ${duration(travel1)} · Vor Ort: ${duration(onsite)} · Rückfahrt: ${duration(travel2)} · Gesamt: ${duration(total)}`+(bad?' – Bitte Datum, Reihenfolge und 15-Minuten-Schritte prüfen.':'');const m1=parseMeter($('#meterStart').value),m2=parseMeter($('#meterEnd').value);let msg='Noch keine vollständigen Zählerstände.',error=false;if(Number.isNaN(m1)||Number.isNaN(m2)||!validPrecision('meterStart')||!validPrecision('meterEnd')){msg='Bitte Zählerstände mit einer Nachkommastelle eingeben.';error=true}else if(m1!==null&&m2!==null){if(m2<m1){msg='Endstand darf nicht kleiner als Anfangsstand sein.';error=true}else{msg=`Kompressorlaufzeit: ${((m2-m1)/100).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:2})} h`}}$('#meterSummary').textContent=msg;$('#meterSummary').className='hint'+(error?' invalid':'');return !bad&&!error}
for(const id of ['meterStart','meterEnd'])$('#'+id).addEventListener('input',calculate);
function validPrecision(id){const v=$('#'+id).value.trim();return !v||/^\d+(?:[.,]\d)?$/.test(v)||v===loadedData[id]||(id==='meterStart'&&v===suggestedStart)}
function compressorId(){return $('#compressor').value===ATLAS?ATLAS:'rental:'+$('#rentalName').value.trim().toLocaleLowerCase('de-DE')}
function compressorName(){return $('#compressor').value===ATLAS?'Atlas Copco XAHS 186 DD':$('#rentalName').value.trim()}
function readExtra(){return {customer:readCustomer(),sourcePdf,people:$('#people').value,times:Object.fromEntries(TIME_KEYS.map(([k])=>[k,$('#'+k).value])),meterStart:$('#meterStart').value,meterEnd:$('#meterEnd').value,compressorId:compressorId(),compressorName:compressorName(),meterConfirmed:$('#meterConfirmed').checked}}
function writeExtra(d={}){writeCustomer(d.customer||{});invalidatePdf();pdfSelectionToken++;sourcePdf=d.sourcePdf||null;$('#sourcePdf').value='';showSourcePdf();suggestedStart='';loadedData=d;$('#people').value=d.people||'1';for(const [k] of TIME_KEYS)setTime(k,d.times?.[k]||'');$('#compressor').value=!d.compressorId||d.compressorId===ATLAS?ATLAS:'rental';$('#rentalName').value=d.compressorId&&d.compressorId!==ATLAS?d.compressorName||'':'';$('#rentalWrap').hidden=$('#compressor').value===ATLAS;$('#meterStart').value=d.meterStart||'';$('#meterEnd').value=d.meterEnd||'';$('#meterConfirmed').checked=!!d.meterConfirmed;$('#meterProposal').textContent='Anfangsstand am Gerät prüfen und bestätigen.';calculate()}
function meterGet(id){return new Promise((resolve,reject)=>{const req=db.transaction(METERS).objectStore(METERS).get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function suggestMeter(){const token=++proposalToken,id=compressorId();suggestedStart='';$('#meterStart').value='';$('#meterEnd').value='';$('#meterConfirmed').checked=false;$('#meterProposal').textContent='Kein gespeicherter Endstand für diesen Kompressor.';if(id==='rental:'){calculate();return}try{const saved=await meterGet(id);if(token!==proposalToken)return;if(saved){suggestedStart=saved.value;$('#meterStart').value=saved.value;$('#meterProposal').textContent='Vorschlag aus letztem gespeicherten Endstand ('+new Date(saved.updatedAt).toLocaleString('de-DE')+'). Bitte am Gerät prüfen.'}calculate()}catch(e){say('Zählerstand konnte nicht geladen werden: '+e.message)}}
$('#compressor').onchange=()=>{$('#rentalWrap').hidden=$('#compressor').value===ATLAS;suggestMeter()};
$('#rentalName').oninput=()=>suggestMeter();
$('#meterStart').addEventListener('input',()=>{proposalToken++;$('#meterConfirmed').checked=false;$('#meterProposal').textContent='Anfangsstand geändert – bitte erneut bestätigen.'});
function saveReport(data){return new Promise((resolve,reject)=>{const tx=db.transaction([STORE,METERS],'readwrite');tx.objectStore(STORE).put(data);if(data.meterEnd.trim()&&Number.isFinite(parseMeter(data.meterEnd)))tx.objectStore(METERS).put({id:data.compressorId,value:data.meterEnd,updatedAt:data.updatedAt});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
function completionValid(){if(!calculate()){say('Bitte ungültige Zeit- oder Zählerstände korrigieren.');return false}if(!$('#meterStart').value.trim()||!$('#meterEnd').value.trim()||!$('#meterConfirmed').checked){say('Vor Abschluss beide Zählerstände eintragen und Anfangsstand am Gerät bestätigen.');return false}if(!compressorName()){say('Bitte Mietkompressor eindeutig benennen.');return false}return true}

const all=()=>transaction('readonly',s=>s.getAll());const get=id=>transaction('readonly',s=>s.get(id));const put=data=>transaction('readwrite',s=>s.put(data));const remove=id=>transaction('readwrite',s=>s.delete(id));
function fresh(){proposalToken++;currentId=null;$('#project').value='';$('#day').value=localDatetime(new Date()).slice(0,10);$('#report').value='';writeExtra();if(db)suggestMeter();clearSign();$('#reports').selectedIndex=-1;refreshReportChoices();say('Neuer Bericht – noch nicht gespeichert')}
$('#new').onclick=fresh;
async function refresh(selectId){const list=(await all()).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));const sel=$('#reports');sel.replaceChildren();for(const r of list){const opt=document.createElement('option');opt.value=r.id;opt.textContent=`${r.project||'Ohne Auftrag'} – ${r.day||'ohne Datum'} (${new Date(r.updatedAt).toLocaleString('de-DE')})`;sel.append(opt)}sel.selectedIndex=-1;if(selectId)sel.value=selectId;await refreshReportChoices(true);}
async function loadId(id){const data=await get(id);if(!data){say('Bericht nicht gefunden');return}proposalToken++;currentId=data.id;$('#project').value=data.project||'';$('#day').value=data.day||'';$('#report').value=data.report||'';writeExtra(data);setSign(data.signature);$('#reports').value=id;await refreshReportChoices();say((data.state==='completed'?'Abgeschlossener Bericht':'Entwurf')+' geladen und bearbeitbar. Änderungen mit „Bericht lokal speichern“ übernehmen. Zuletzt gespeichert: '+new Date(data.updatedAt).toLocaleString('de-DE'))}
$('#load').onclick=async()=>{try{const id=$('#reports').value;if(!id){say('Bitte einen Bericht auswählen');return}await loadId(id)}catch(e){say('Laden fehlgeschlagen: '+e.message)}};
async function persist(finalize=false){try{if(finalize&&!completionValid())return;if(!calculate()){say('Bitte ungültige Zeit- oder Zählerstände korrigieren.');return}if($('#compressor').value==='rental'&&!compressorName()){say('Bitte Mietkompressor eindeutig benennen.');return}const id=currentId||crypto.randomUUID(),now=new Date().toISOString(),old=currentId?await get(currentId):null;const data={...old,id,project:$('#project').value.trim(),day:$('#day').value,report:$('#report').value,...readExtra(),signature:canvas.toDataURL('image/png'),createdAt:old?.createdAt||now,updatedAt:now,version:'0.5.4',state:finalize?'completed':'draft',completedAt:finalize?now:null};await saveReport(data);currentId=id;loadedData=data;await refresh(id);say((finalize?'Bericht abgeschlossen und lokal gespeichert: ':'Entwurf lokal gespeichert: ')+new Date().toLocaleString('de-DE'));return data}catch(e){say('Speichern fehlgeschlagen: '+e.message)}}
$('#save').onclick=()=>persist();$('#complete').onclick=()=>persist(true);
$('#backup').onclick=async()=>{try{const reports=await all();const meters=await new Promise((resolve,reject)=>{const r=db.transaction(METERS).objectStore(METERS).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const url=URL.createObjectURL(new Blob([JSON.stringify({version:'0.5.4',reports,meters},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='LST-Sicherung-'+localDatetime(new Date()).slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);say('Sicherungsdatei erstellt – bitte in Dateien sichern.')}catch(e){say('Sicherung fehlgeschlagen: '+e.message)}};
$('#delete').onclick=async()=>{const id=$('#reports').value;if(!id){say('Bitte einen Bericht auswählen');return}if(!confirm('Ausgewählten Bericht wirklich löschen?'))return;try{await remove(id);if(currentId===id)fresh();await refresh();say('Bericht gelöscht')}catch(e){say('Löschen fehlgeschlagen: '+e.message)}};
const escapeHtml=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function showEditor(){ $('#preview').classList.remove('visible');$('#editor').classList.remove('hidden');window.scrollTo(0,0); }
function showPreview(){
 const box=$('#printContent');box.replaceChildren();
 const logo=document.createElement('img');logo.src='./assets/briefkopf.png';logo.alt='Lüke Strahltechnik';box.append(logo);
 const heading=document.createElement('h1');heading.textContent='Arbeitsnachweis zum Lieferschein '+deliveryNumber();box.append(heading);
 const c=readCustomer();
 const rows=[['Berichtsdatum',formatReportDay($('#day').value)],['Auftrag',$('#project').value],['Arbeitsbericht',$('#report').value],['Vorarbeiter',c.foreman],['Facharbeiter',c.worker],['Strahlmittel',c.abrasive==='Sonstiges'?c.abrasiveOther:c.abrasive],['Menge',(c.baseQuantity?'Grundmenge; ':'')+(c.abrasiveKg?c.abrasiveKg+' kg':'')],['Einstellung','Air: '+(c.airSetting||'–')+' / Media: '+(c.mediaSetting||'–')],['Düse',c.nozzle],['Abschlussbestätigung','Die Arbeiten aus allen beigefügten Tagesberichten wurden ordnungsgemäß durchgeführt. Unterschrift nur auf der letzten Berichtsseite des Gesamt-PDFs.'],['Name',c.signerName],['Datum',c.signedDay]];
 for(const [label,value] of rows){const el=document.createElement('p');el.textContent=label+': '+(value||'–');box.append(el)}
 const img=document.createElement('img');img.alt='Kundenunterschrift';img.src=canvas.toDataURL('image/png');box.append(img);
 $('#editor').classList.add('hidden');$('#preview').classList.add('visible');window.scrollTo(0,0);
}
$('#pdf').onclick=showPreview;
$('#back').onclick=showEditor;
$('#print').onclick=()=>{if(completionValid())window.print();else showEditor()};
window.addEventListener('afterprint',()=>{ /* Vorschau bleibt mit sichtbarem Zurück-Button geöffnet */ });
async function migrateOld(){const old=localStorage.getItem('lst-pwa-test');if(!old||localStorage.getItem('lst-v02-migrated'))return;try{const d=JSON.parse(old);const now=new Date().toISOString();await put({id:crypto.randomUUID(),project:'Übernommener Test aus Version 0.1',day:(d.savedAt||now).slice(0,10),report:d.report||'',signature:d.signature||'',createdAt:d.savedAt||now,updatedAt:now});localStorage.setItem('lst-v02-migrated','1')}catch(e){say('Übernahme alter Testdaten nicht möglich: '+e.message)}}
(async()=>{try{db=await openDb();await migrateOld();await seedMeters();await refresh();fresh();say('Bereit – Berichte werden getrennt gespeichert.')}catch(e){say('Lokaler Speicher nicht verfügbar: '+e.message);$('#save').disabled=true}})();
async function seedMeters(){const reports=(await all()).sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt));for(const r of reports){const id=r.compressorId||ATLAS;if(r.meterEnd&&Number.isFinite(parseMeter(r.meterEnd))){const saved=await meterGet(id);if(!saved||saved.updatedAt<r.updatedAt)await new Promise((resolve,reject)=>{const tx=db.transaction(METERS,'readwrite');tx.objectStore(METERS).put({id,value:r.meterEnd,updatedAt:r.updatedAt});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}}}
if('serviceWorker'in navigator){navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(e=>say('Offline-Installation fehlgeschlagen: '+e.message));let reloading=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!reloading){reloading=true;$('#updateNotice').hidden=false}})}

function showSourcePdf(){const info=$('#sourcePdfInfo');info.textContent=sourcePdf?sourcePdf.name+' · '+sourcePdf.pages+' Originalseite(n). Wird mit dem Bericht lokal gespeichert.':'Noch kein Lieferschein ausgewählt.'}
$('#sourcePdf').onchange=async()=>{
 const file=$('#sourcePdf').files[0];if(!file)return;
 const token=++pdfSelectionToken;
 try{
  say('Lieferschein wird eingelesen …');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const document=await PDFLib.PDFDocument.load(bytes);
  if(!document.getPageCount())throw new Error('Das PDF enthält keine Seiten.');
  let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  if(token!==pdfSelectionToken)return;
  invalidatePdf();sourcePdf={name:file.name,data:btoa(binary),pages:document.getPageCount()};
  $('#project').value=projectFromFilename(file.name);showSourcePdf();await refreshReportChoices();
  say('Lieferschein übernommen. Auftrag aus Dateiname vorausgefüllt und frei änderbar. Bitte Bericht lokal speichern.');
 }catch(e){if(token===pdfSelectionToken)say('PDF konnte nicht eingelesen werden. Bitte ein lesbares, nicht passwortgeschütztes PDF wählen. Die bisherige Auswahl bleibt erhalten.')}
 finally{if(token===pdfSelectionToken)$('#sourcePdf').value=''}
};
$('#combinedPdf').onclick=async()=>{
 if(!sourcePdf){say('Bitte zuerst den ursprünglichen Lieferschein als PDF auswählen.');return}
 const button=$('#combinedPdf');button.disabled=true;
 try{
  const revision=pdfRevision;
  const reports=await selectedReportData();if(!reports)return;
  const confirmation=reports[reports.length-1];const data={sourcePdf,reports,confirmation};
  const name=sourcePdf.name.replace(/\.pdf$/i,'')+(reports.length>1?' mit Arbeitsberichten.pdf':' mit Abschlussseite.pdf');
  const bytes=await buildCombinedPdf(data);if(revision!==pdfRevision){say('Angaben wurden während der PDF-Erstellung geändert. Bitte Gesamt-PDF erneut erstellen.');return}
  const unsigned=[];if(!confirmation.customer?.signerName?.trim()||!confirmation.customer?.signedDay||!await hasSignature(confirmation.signature))unsigned.push(formatReportDay(confirmation.day));
  if(revision!==pdfRevision){say('Angaben wurden während der PDF-Erstellung geändert. Bitte Gesamt-PDF erneut erstellen.');return}
  preparedPdf={bytes,name,unsigned};$('#sharePdf').disabled=false;$('#shareStatus').textContent='Gesamt-PDF mit '+reports.length+' Arbeitsnachweis(en) bereit. Empfänger kopieren und über Teilen → Mail versenden.';
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  say('Gesamt-PDF mit Arbeitsnachweis im LST-Format erstellt. Du kannst es jetzt über Mail teilen. Aktuelle Änderungen zusätzlich lokal speichern.');
 }catch(e){say('Gesamt-PDF konnte nicht erstellt werden: '+e.message)}finally{button.disabled=false}
};

function deliveryNumber(){return ($('#project').value.match(/\bLS\d+\b/i)||sourcePdf?.name.match(/\bLS\d+\b/i)||[''])[0].toUpperCase()}
function readCustomer(){return {...Object.fromEntries(CUSTOMER_KEYS.map(k=>[k,$('#'+k).value])),baseQuantity:$('#baseQuantity').checked}}
function writeCustomer(c){for(const k of CUSTOMER_KEYS)$('#'+k).value=c[k]??(k==='lstEmail'?'post@lueke-strahlt.de':k==='signedDay'?localDatetime(new Date()).slice(0,10):'');$('#baseQuantity').checked=!!c.baseQuantity}
function invalidatePdf(){pdfRevision++;preparedPdf=null;$('#sharePdf').disabled=true;$('#shareStatus').textContent='Vor dem Teilen das aktuelle Gesamt-PDF erstellen.'}
for(const event of ['input','change'])$('#editor').addEventListener(event,invalidatePdf);
canvas.addEventListener('pointerdown',e=>{if(allowed(e))invalidatePdf()});
$('#clear').addEventListener('click',invalidatePdf);
for(const [key] of TIME_KEYS)$('#'+key+'Time').parentElement.querySelectorAll('button').forEach(b=>b.addEventListener('click',invalidatePdf));
function recipientAddresses(){const addresses=['lstEmail','customerEmail'].map(id=>{const field=$('#'+id);if(!field.value.trim()||!field.checkValidity())throw new Error('Bitte gültige E-Mail-Adressen für LST und Kunde eintragen.');return field.value.trim()});return [...new Set(addresses)]}
$('#copyEmails').onclick=async()=>{try{const addresses=recipientAddresses().join(', ');await navigator.clipboard.writeText(addresses);$('#shareStatus').textContent='Beide Adressen kopiert. In Mail in das Empfängerfeld einsetzen.'}catch(e){$('#shareStatus').textContent=e.name==='NotAllowedError'||e.name==='TypeError'?'Adressen bitte manuell aus den beiden E-Mail-Feldern übernehmen.':e.message}};
$('#sharePdf').onclick=()=>{
 try{
  recipientAddresses();if(!preparedPdf)throw new Error('Bitte das aktuelle Gesamt-PDF zuerst erstellen.');if(preparedPdf.unsigned.length)throw new Error('Zum Auftragsabschluss bitte den letzten ausgewählten Tagesbericht laden und dort Kundenname, Bestätigungsdatum und die einmalige Unterschrift ergänzen: '+preparedPdf.unsigned.join(', '));
  const file=new File([preparedPdf.bytes],preparedPdf.name,{type:'application/pdf'});
  if(!navigator.canShare||!navigator.canShare({files:[file]})){say('Dateiteilen ist hier nicht verfügbar. Das heruntergeladene PDF in Dateien öffnen und dort Teilen → Mail wählen.');return}
  navigator.share({files:[file],title:'Lieferschein '+deliveryNumber(),text:'Anbei erhalten Sie den Lieferschein mit den Arbeitsnachweisen und der gemeinsamen Abschlussbestätigung.'}).then(()=>{say('PDF an die gewählte App übergeben. Der tatsächliche Versand wird in Mail durchgeführt. Es liegt keine Versandbestätigung der Web-App vor.')}).catch(e=>{say(e.name==='AbortError'?'Teilen abgebrochen. Das PDF bleibt zum erneuten Teilen bereit.':'Teilen fehlgeschlagen. Bitte das heruntergeladene PDF aus Dateien über Mail teilen.')});
 }catch(e){say(e.message)}
};

function reportJobKey(report){const sourceNumber=report.sourcePdf?.name?.match(/\bLS\d+\b/i)?.[0],projectNumber=report.project?.match(/\bLS\d+\b/i)?.[0];return sourceNumber||projectNumber?('ls:'+(sourceNumber||projectNumber).toUpperCase()):'project:'+String(report.project||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('de-DE')}
function currentReportData(){return {...readExtra(),id:currentId||'__current__',deliveryNumber:deliveryNumber(),project:$('#project').value,day:$('#day').value,report:$('#report').value,signature:canvas.toDataURL('image/png')}}
async function refreshReportChoices(preserve=false){
 const token=++choicesToken,container=$('#dayReportChoices'),current=currentReportData(),context=reportJobKey(current)+'|'+currentId;
 const checked=preserve&&choicesContext===context?new Set([...container.querySelectorAll('input:checked')].map(input=>input.value)):new Set(['__current__']);
 if(!db)return;
 try{
  const reports=(await all()).filter(r=>r.id!==currentId&&reportJobKey(r)===reportJobKey(current));
  if(token!==choicesToken)return;
  reports.push({...current,id:'__current__'});reports.sort((a,b)=>(a.day||'').localeCompare(b.day||'')||a.id.localeCompare(b.id));
  container.replaceChildren();choicesContext=context;
  for(const r of reports){const label=document.createElement('label');label.className='confirm';const input=document.createElement('input');input.type='checkbox';input.value=r.id;input.checked=checked.has(r.id);label.append(input,document.createTextNode(' '+formatReportDay(r.day)+' — '+(r.id==='__current__'?'aktueller Bericht (aktueller Stand)':r.project||'Ohne Auftrag')));container.append(label)}
 }catch(e){say('Tagesberichte konnten nicht geladen werden: '+e.message)}
}
$('#multiDayExport').onchange=()=>{$('#dayReportOptions').hidden=!$('#multiDayExport').checked;if($('#multiDayExport').checked)refreshReportChoices()};
$('#project').addEventListener('change',()=>refreshReportChoices());$('#day').addEventListener('change',()=>refreshReportChoices(true));
async function selectedReportData(){
 const current=currentReportData();let reports;
 if(!$('#multiDayExport').checked){if(!completionValid())return null;reports=[current]}
 else{
  const ids=[...document.querySelectorAll('#dayReportChoices input:checked')].map(input=>input.value);if(!ids.length)throw new Error('Bitte mindestens einen Tagesbericht auswählen.');
  if(ids.includes('__current__')&&!completionValid())return null;
  reports=await Promise.all(ids.map(id=>id==='__current__'?current:get(id)));
  for(const report of reports){if(!report)throw new Error('Ein ausgewählter Tagesbericht wurde inzwischen gelöscht. Bitte die Auswahl neu öffnen.');if(reportJobKey(report)!==reportJobKey(current))throw new Error('Ein Tagesbericht gehört zu einem anderen Lieferschein. Bitte Auswahl prüfen.');const start=parseMeter(report.meterStart||''),end=parseMeter(report.meterEnd||'');if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||!report.meterConfirmed)throw new Error('Bitte Zählerstände und bestätigten Anfang im Tagesbericht vom '+formatReportDay(report.day)+' prüfen.');}
 }
 if(reports.some(r=>!/^\d{4}-\d{2}-\d{2}$/.test(r.day||'')))throw new Error('Bitte bei jedem ausgewählten Tagesbericht das Berichtsdatum eintragen.');
 return reports.sort((a,b)=>a.day.localeCompare(b.day)||(a.createdAt||'').localeCompare(b.createdAt||'')||a.id.localeCompare(b.id)).map(report=>({...report,deliveryNumber:deliveryNumber()}));
}
function hasSignature(data){return new Promise(resolve=>{if(!data){resolve(false);return}const image=new Image();image.onload=()=>{try{const test=document.createElement('canvas');test.width=image.width;test.height=image.height;const context=test.getContext('2d');context.drawImage(image,0,0);const pixels=context.getImageData(0,0,test.width,test.height).data;for(let i=3;i<pixels.length;i+=4)if(pixels[i]){resolve(true);return}resolve(false)}catch(e){resolve(false)}};image.onerror=()=>resolve(false);image.src=data})}
$('#nextDay').onclick=async()=>{
 const saved=await persist();if(!saved)return;
 const oldSource=sourcePdf,project=$('#project').value,customer=readCustomer(),date=$('#day').value;
 fresh();sourcePdf=oldSource;$('#project').value=project;const next=new Date((date||localDatetime(new Date()).slice(0,10))+'T12:00');next.setDate(next.getDate()+1);$('#day').value=localDatetime(next).slice(0,10);
 writeCustomer({foreman:customer.foreman,worker:customer.worker,lstEmail:customer.lstEmail,customerEmail:customer.customerEmail,signedDay:$('#day').value});showSourcePdf();await refreshReportChoices();say('Vorheriger Tag gespeichert. Neuer Tagesbericht für denselben Auftrag angelegt. Die Kundenunterschrift wird erst am Ende des gesamten Auftrags benötigt.');
};
