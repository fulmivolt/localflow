import { Recorder, resample } from './audio.js';
const $=id=>document.getElementById(id);
const token=document.querySelector('meta[name="localflow-token"]').content;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state, recorder, worker, inferenceReject, working=false, recording=false, starting=false, canceled=false, recordTimer, downloadTimer, undoText='', noteLoaded=false;
const names={home:'Dettatura',history:'Cronologia',scratch:'Blocco note',snippets:'Snippet',dictionary:'Dizionario',models:'Modelli AI',settings:'Impostazioni'};
const providers={rules:'Regole locali',local:'SmolLM2 sul dispositivo',openai:'OpenAI · cloud',anthropic:'Claude · cloud'};
function notice(message,success=false){$('notice').textContent=message;$('notice').hidden=!message;$('notice').className=success?'success':'';}
async function api(route,body){const response=await fetch('/api/'+route,{method:body===undefined?'GET':'POST',headers:{'X-LocalFlow-Token':token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Operazione fallita.');return data;}
function action(id,fn,event='click'){$(id).addEventListener(event,async e=>{try{await fn(e);}catch(error){notice(error.message);}});}
function page(name){for(const p of document.querySelectorAll('.page'))p.hidden=p.id!==name;for(const b of document.querySelectorAll('[data-page]'))b.classList.toggle('active',b.dataset.page===name);$('title').textContent=names[name];}
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>page(b.dataset.page));
document.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>page(b.dataset.goto));
function download(name,text,type='text/plain'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function refresh(){
  state=await api('state');
  document.body.classList.toggle('light',state.settings.theme==='light');
  const speech=state.models.find(m=>m.id===state.settings.selectedModel);
  $('speech-name').textContent=speech.name;
  $('connection').textContent=state.runtime&&speech.installed?'Modello pronto · locale':'Completa installazione';
  $('provider-name').textContent=providers[state.settings.processingProvider];
  $('provider-description').textContent=['openai','anthropic'].includes(state.settings.processingProvider)?'Il testo elaborato verrà inviato al provider selezionato.':'Nessun invio di testo a servizi esterni.';
  if(!noteLoaded){$('scratch-text').value=state.scratchpad;noteLoaded=true;}
  const form=$('settings-form');
  for(const [key,value] of Object.entries(state.settings)){const input=form.elements.namedItem(key);if(input){if(input.type==='checkbox')input.checked=value;else input.value=value;}}
  $('key-status').textContent=`OpenAI: ${state.keys.openai?'chiave presente':'nessuna chiave'} · Anthropic: ${state.keys.anthropic?'chiave presente':'nessuna chiave'}`;
  $('runtime-warning').hidden=state.runtime;
  renderHistory();renderEntries();renderModels();
}
function renderHistory(){
  const q=$('history-search').value.toLocaleLowerCase();
  $('history-list').innerHTML=state.history.filter(h=>h.processed.toLocaleLowerCase().includes(q)).map(h=>`<article class="card list-item"><div class="copy"><p>${esc(h.processed)}</p><small>${esc(new Date(h.createdAt).toLocaleString())} · ${esc(h.model)} · ${(h.durationMs/1000).toFixed(1)} s</small></div><div class="buttons"><button data-copy="${h.id}">Copia</button><button data-edit-history="${h.id}">Modifica</button><button data-delete="history:${h.id}" aria-label="Elimina trascrizione">×</button></div></article>`).join('')||'<div class="empty">Nessuna trascrizione trovata.</div>';
}
function renderEntries(){
  $('dictionary-list').innerHTML=state.dictionary.map(d=>`<article class="card list-item"><div class="copy"><p>${esc(d.source)} → ${esc(d.replacement)}</p><small>${d.caseSensitive?'Maiuscole/minuscole distinte':'Qualsiasi maiuscola/minuscola'}</small></div><button data-edit="dictionary:${d.id}">Modifica</button><button data-delete="dictionary:${d.id}" aria-label="Elimina termine">×</button></article>`).join('')||'<div class="empty">Aggiungi il primo termine.</div>';
  $('snippet-list').innerHTML=state.snippets.map(s=>`<article class="card list-item"><div class="copy"><h3>${esc(s.name)}</h3><small>Pronuncia: “${esc(s.trigger)}” · ${esc(s.category)}</small><p>${esc(s.content)}</p></div><button data-edit="snippets:${s.id}">Modifica</button><button data-delete="snippets:${s.id}" aria-label="Elimina snippet">×</button></article>`).join('')||'<div class="empty">Aggiungi il primo snippet.</div>';
}
function renderModels(){
  $('model-list').innerHTML=state.models.map(m=>`<article class="card list-item model"><div class="model-icon">${m.category==='speech'?'◉':'✦'}</div><div class="copy"><h3>${esc(m.name)} ${m.installed?'· installato':''}</h3><p>${esc(m.description)}</p><small>${esc(m.size)} download · ${esc(m.ram)} RAM indicativa · ${esc(m.license)}</small></div><div class="buttons">${m.installed?`${m.category==='speech'?`<button data-select="${m.id}">${state.settings.selectedModel===m.id?'Selezionato':'Usa modello'}</button>`:''}<button data-verify="${m.id}">Verifica</button><button data-remove-model="${m.id}" aria-label="Elimina modello">×</button>`:`<button class="primary" data-install="${m.id}">Installa</button>`}</div></article>`).join('');
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||!state)return;
  try{
    if(b.dataset.delete){const [table,id]=b.dataset.delete.split(':');if(confirm('Eliminare questo elemento?')){await api('delete',{table,id});await refresh();}}
    if(b.dataset.edit){const [table,id]=b.dataset.edit.split(':');const entry=state[table].find(x=>x.id===+id), form=$(table==='snippets'?'snippet-form':'dictionary-form');for(const [k,v]of Object.entries(entry)){const input=form.elements.namedItem(k);if(input){if(input.type==='checkbox')input.checked=!!v;else input.value=v;}}form.scrollIntoView({behavior:'smooth'});}
    if(b.dataset.copy){await navigator.clipboard.writeText(state.history.find(h=>h.id===+b.dataset.copy).processed);notice('Testo copiato.',true);}
    if(b.dataset.editHistory){const h=state.history.find(h=>h.id===+b.dataset.editHistory);const processed=prompt('Modifica trascrizione:',h.processed);if(processed!==null){await api('history/edit',{id:h.id,processed});await refresh();}}
    if(b.dataset.select){if(working||recording)throw new Error('Termina la registrazione o elaborazione prima di cambiare modello.');await api('settings',{settings:{...state.settings,selectedModel:b.dataset.select}});disposeWorker();await refresh();}
    if(b.dataset.install){const m=state.models.find(x=>x.id===b.dataset.install);if(confirm(`Scaricare ${m.name} (${m.size}) da Hugging Face?`)){await api('model/install',{id:m.id});pollDownload();}}
    if(b.dataset.verify){notice('Verifica integrità…',true);await api('model/verify',{id:b.dataset.verify});notice('Integrità verificata.',true);}
    if(b.dataset.removeModel){if(working||recording)throw new Error('Termina prima l’elaborazione.');if(confirm('Eliminare il modello dal disco?')){disposeWorker();await api('model/delete',{id:b.dataset.removeModel});await refresh();}}
  }catch(error){notice(error.message);}
});
async function pollDownload(){
  clearTimeout(downloadTimer);
  try{
    const d=await api('download');$('download-box').hidden=d.status==='idle';
    $('download-text').textContent=d.error||`${d.file||'Preparazione…'} · ${(d.received/1e6||0).toFixed(1)} / ${(d.total/1e6||0).toFixed(1)} MB`;
    $('download-progress').value=d.total?d.received/d.total:0;
    $('cancel-download').hidden=d.status!=='downloading';
    if(d.status==='downloading')downloadTimer=setTimeout(pollDownload,650);
    else{await refresh();if(d.status==='complete')notice('Modello installato e verificato.',true);if(d.status==='error')notice(d.error);}
  }catch(e){notice(e.message);}
}
function disposeWorker(){worker?.terminate();worker=null;if(inferenceReject){inferenceReject(new Error('Elaborazione annullata.'));inferenceReject=null;}}
function infer(payload){
  return new Promise((resolve,reject)=>{
    if(!worker)worker=new Worker('/inference.js',{type:'module'});
    inferenceReject=reject;
    worker.onmessage=({data})=>{if(data.type==='status')$('record-status').textContent=data.message;else if(data.type==='result'){inferenceReject=null;resolve(data.text);}else if(data.type==='error'){inferenceReject=null;reject(new Error(data.message));}};
    worker.onerror=e=>{inferenceReject=null;reject(new Error(e.message||'Runtime AI non disponibile. Esegui npm run setup.'));disposeWorker();};
    worker.postMessage(payload,payload.audio?[payload.audio.buffer]:[]);
  });
}
async function ai(text,instruction){
  const provider=state.settings.processingProvider;
  if(provider==='rules')return (await api('prepare',{text})).text;
  if(provider==='local'){
    const model=state.models.find(m=>m.id==='smollm2');if(!model.installed)throw new Error('Installa SmolLM2 dalla libreria modelli.');
    return infer({model,text,instruction});
  }
  return (await api('cloud',{text,instruction})).text;
}
function displayRecording(){
  $('record').classList.toggle('listening',recording);$('record').textContent=recording?'■':'●';
  $('record').disabled=working||starting;$('record').setAttribute('aria-label',recording?'Ferma registrazione':'Avvia registrazione');
  $('record-title').textContent=recording?'Ti ascolto…':working?'Elaborazione…':'Pronto quando vuoi';
  $('cancel').hidden=!(recording||working);
  $('rewrite').disabled=working||recording;
  $('custom-rewrite').disabled=working||recording;
  $('rewrite').textContent=working?'Elaborazione… (Esc per annullare)':'Applica AI';
  $('scratch-text').readOnly=working;
}
async function cancel(){canceled=true;clearTimeout(recordTimer);await recorder?.cancel();recording=false;disposeWorker();$('level').value=0;displayRecording();}
async function transcribe(audio){
  if(audio.length<8000)throw new Error('Registrazione troppo breve. Parla per almeno mezzo secondo.');
  working=true;canceled=false;displayRecording();const started=performance.now();
  try{
    const model=state.models.find(m=>m.id===state.settings.selectedModel);
    if(!model.installed)throw new Error('Installa e seleziona un modello vocale.');
    const original=await infer({model,audio,language:state.settings.language});if(canceled)return;
    $('transcript').value=original;
    let processed=(await api('prepare',{text:original})).text;
    if(state.settings.cleanup&&state.settings.processingProvider!=='rules'){
      try{processed=await ai(processed,'Correggi grammatica e punteggiatura. Mantieni il significato e la lingua originale. Restituisci solo il testo corretto.');}
      catch(e){notice(`Trascrizione conservata. Elaborazione AI non riuscita: ${e.message}`);}
    }
    if(canceled)return;
    $('transcript').value=processed;
    const durationMs=Math.round(performance.now()-started);
    await api('history',{original,processed,model:model.name,durationMs});
    $('timing').textContent=`${(durationMs/1000).toFixed(1)} secondi`;
    await refresh();
  }finally{working=false;displayRecording();$('record-status').textContent='Clicca il microfono o premi Ctrl + Shift + Spazio';}
}
async function toggle(){
  if(working||starting)return;
  notice('');
  if(!recording){
    if(!state.runtime)throw new Error('Prima esegui npm run setup per installare il runtime.');
    if(!state.models.find(m=>m.id===state.settings.selectedModel)?.installed)throw new Error('Installa un modello dalla sezione Modelli AI.');
    starting=true;displayRecording();
    try{recorder=new Recorder();await recorder.start($('microphone').value,v=>$('level').value=v,()=>{cancel();notice('Microfono scollegato. Registrazione annullata.');});recording=true;recordTimer=setTimeout(()=>toggle().catch(e=>notice(e.message)),120000);}
    finally{starting=false;displayRecording();}
  }else{
    clearTimeout(recordTimer);recording=false;const peak=recorder.peak;const audio=await recorder.stop();$('level').value=0;displayRecording();
    if(peak<0.001)throw new Error('Nessun segnale audio rilevato. Controlla microfono e volume.');
    await transcribe(audio);
  }
}
async function microphones(request=false){
  if(request){const stream=await navigator.mediaDevices.getUserMedia({audio:true});stream.getTracks().forEach(t=>t.stop());}
  const devices=await navigator.mediaDevices.enumerateDevices();
  const previous=$('microphone').value||state.settings.microphone;
  $('microphone').innerHTML='<option value="">Predefinito del sistema</option>'+devices.filter(d=>d.kind==='audioinput').map((d,i)=>`<option value="${esc(d.deviceId)}">${esc(d.label||`Microfono ${i+1}`)}</option>`).join('');
  if([...$('microphone').options].some(o=>o.value===previous))$('microphone').value=previous;
}
action('record',toggle);action('cancel',cancel);action('refresh-mics',()=>microphones(true));
document.addEventListener('keydown',e=>{if(e.ctrlKey&&e.shiftKey&&e.code==='Space'){e.preventDefault();if(!e.repeat)toggle().catch(error=>notice(error.message));}if(e.code==='Escape'&&(recording||working))cancel().catch(error=>notice(error.message));});
action('microphone',async()=>{await api('settings',{settings:{...state.settings,microphone:$('microphone').value}});await refresh();},'change');
action('copy-transcript',async()=>{await navigator.clipboard.writeText($('transcript').value);notice('Copiato. Usa Ctrl+V nell’applicazione desiderata.',true);});
action('to-scratch',async()=>{$('scratch-text').value=$('transcript').value;await saveNote();page('scratch');});
action('history-search',renderHistory,'input');
action('clear-history',async()=>{if(confirm('Eliminare tutta la cronologia locale?')){await api('history/clear',{});await refresh();}});
action('export-history',()=>download('localflow-history.json',JSON.stringify(state.history,null,2),'application/json'));
action('export-dictionary',()=>download('localflow-dictionary.json',JSON.stringify(state.dictionary,null,2),'application/json'));
for(const id of ['dictionary-form','snippet-form'])$(id).addEventListener('reset',()=>{$(id).elements.namedItem('id').value='';});
action('dictionary-form',async e=>{e.preventDefault();const form=e.currentTarget, values=Object.fromEntries(new FormData(form));values.caseSensitive=form.elements.caseSensitive.checked;await api('dictionary',values);form.reset();await refresh();},'submit');
action('snippet-form',async e=>{e.preventDefault();const form=e.currentTarget;await api('snippet',Object.fromEntries(new FormData(form)));form.reset();await refresh();},'submit');
action('import-dictionary',async e=>{const file=e.target.files[0];if(!file)return;if(file.size>1_000_000)throw new Error('File troppo grande.');const entries=JSON.parse(await file.text());if(!Array.isArray(entries)||entries.length>500||entries.some(d=>typeof d.source!=='string'||!d.source.trim()||d.source.length>1000||typeof d.replacement!=='string'||d.replacement.length>10000))throw new Error('Dizionario non valido (massimo 500 voci).');for(const d of entries)await api('dictionary',{source:d.source,replacement:d.replacement,caseSensitive:!!d.caseSensitive});await refresh();e.target.value='';notice('Dizionario importato.',true);},'change');
action('settings-form',async e=>{e.preventDefault();const f=e.currentTarget,s={...state.settings,...Object.fromEntries(new FormData(f)),cleanup:f.elements.cleanup.checked,historyEnabled:f.elements.historyEnabled.checked};if(['openai','anthropic'].includes(s.processingProvider)&&s.processingProvider!==state.settings.processingProvider&&!confirm('Confermi l’invio del testo al provider cloud selezionato durante l’elaborazione AI?'))return;await api('settings',{settings:s});await refresh();notice('Impostazioni salvate.',true);},'submit');
action('key-form',async e=>{e.preventDefault();const f=e.currentTarget;await api('key',Object.fromEntries(new FormData(f)));f.elements.key.value='';await refresh();notice('Chiave aggiornata per questa sessione.',true);},'submit');
async function saveNote(){await api('scratchpad',{text:$('scratch-text').value});$('note-status').textContent='Salvato sul dispositivo';}
action('save-note',saveNote);action('scratch-text',()=>{$('note-status').textContent='Modifiche non salvate';},'input');
action('copy-note',()=>navigator.clipboard.writeText($('scratch-text').value));action('export-note',()=>download('localflow-note.txt',$('scratch-text').value));
async function rewrite(instruction){
  if(working||recording)throw new Error('Termina prima la registrazione o l’elaborazione.');
  if(!instruction.trim()||!$('scratch-text').value.trim())throw new Error('Inserisci testo e istruzione.');
  if(state.settings.processingProvider==='rules')throw new Error('Per riscrittura e traduzione scegli un modello locale o un provider cloud nelle impostazioni.');
  working=true;canceled=false;displayRecording();
  try{const original=$('scratch-text').value,result=await ai(original,instruction);if(!canceled){undoText=original;$('scratch-text').value=result;await saveNote();}}
  finally{working=false;displayRecording();}
}
action('rewrite',()=>rewrite($('transform').value));action('custom-rewrite',()=>rewrite($('custom-instruction').value));
action('undo',async()=>{if(undoText){const current=$('scratch-text').value;$('scratch-text').value=undoText;undoText=current;await saveNote();}});
action('cancel-download',()=>api('model/cancel',{}));
action('audio-file',async e=>{
  if(working||recording)throw new Error('Termina prima la registrazione.');const file=e.target.files[0];if(!file)return;
  if(file.size>30_000_000)throw new Error('Audio troppo grande (massimo 30 MB).');
  const context=new AudioContext();
  try{const decoded=await context.decodeAudioData(await file.arrayBuffer());if(decoded.duration>120)throw new Error('Audio troppo lungo (massimo 2 minuti).');await transcribe(resample(decoded.getChannelData(0),decoded.sampleRate));}
  finally{await context.close();e.target.value='';}
},'change');
window.addEventListener('beforeunload',e=>{if(recording||working||$('note-status').textContent==='Modifiche non salvate'){e.preventDefault();e.returnValue='';}});
try{await refresh();await microphones();navigator.mediaDevices.addEventListener('devicechange',()=>microphones().catch(e=>notice(e.message)));await pollDownload();}catch(e){notice(e.message);}
