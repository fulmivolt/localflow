import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve, extname, sep } from 'node:path';
import { mkdirSync, existsSync, createReadStream } from 'node:fs';
import { readFile, stat, rm } from 'node:fs/promises';
import { processText, extractOpenAI } from './lib/text.mjs';
import { CATALOG, modelById, modelDir, installed, downloadModel, verifyModel } from './lib/models.mjs';

const ROOT = fileURLToPath(new URL('.',import.meta.url));
const DEFAULTS = { language:'auto', shortcut:'Ctrl+Shift+Space', cleanup:true, fillerLevel:'balanced', historyEnabled:true, selectedModel:'whisper-tiny', processingProvider:'rules', openaiModel:'gpt-5-mini', anthropicModel:'claude-sonnet-4-5', theme:'dark', microphone:'' };
const PROVIDERS = new Set(['rules','local','openai','anthropic']);
const text = (v, max=100000) => { if (typeof v !== 'string' || v.length > max) throw new Error('Testo non valido o troppo lungo.'); return v; };
const required = (v,max=1000) => { const s=text(v,max).trim(); if(!s)throw new Error('Compila tutti i campi richiesti.'); return s; };

export function startServer({ dataDir=join(ROOT,'data'), port=4318 }={}) {
  mkdirSync(dataDir,{recursive:true});
  const db=new DatabaseSync(join(dataDir,'localflow.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY,original TEXT,processed TEXT,model TEXT,language TEXT,durationMs INTEGER,createdAt TEXT);
    CREATE TABLE IF NOT EXISTS dictionary(id INTEGER PRIMARY KEY,source TEXT,replacement TEXT,caseSensitive INTEGER);
    CREATE TABLE IF NOT EXISTS snippets(id INTEGER PRIMARY KEY,name TEXT,trigger TEXT UNIQUE COLLATE NOCASE,content TEXT,category TEXT);
  `);
  const token=randomBytes(32).toString('hex');
  const keys=new Map();
  let job={ status:'idle' }, controller;
  const getKV=(key,fallback)=>{const row=db.prepare('SELECT value FROM kv WHERE key=?').get(key);return row?JSON.parse(row.value):fallback;};
  const setKV=(key,value)=>db.prepare('INSERT INTO kv VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));
  const settings=()=>({...DEFAULTS,...getKV('settings',{})});
  const dictionary=()=>db.prepare('SELECT * FROM dictionary ORDER BY id').all();
  const snippets=()=>db.prepare('SELECT * FROM snippets ORDER BY id').all();
  const listModels=()=>CATALOG.map(m=>({...m,installed:installed(dataDir,m)}));
  let origin;
  const server=http.createServer(async(req,res)=>{
    const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    try {
      if(req.headers.host!==new URL(origin).host) return send(403,{error:'Host non consentito.'});
      if(req.headers.origin && req.headers.origin!==origin) return send(403,{error:'Origine non consentita.'});
      const url=new URL(req.url,origin);
      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Cross-Origin-Opener-Policy','same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
      res.setHeader('Cross-Origin-Resource-Policy','same-origin');
      res.setHeader('Referrer-Policy','no-referrer');
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self' blob:; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
      if(url.pathname.startsWith('/api/')) {
        if(req.headers['x-localflow-token']!==token) return send(403,{error:'Sessione non valida. Ricarica la pagina.'});
        const allowedGet=['/api/state','/api/download'];
        if(req.method==='GET' && !allowedGet.includes(url.pathname))return send(405,{error:'Metodo non consentito.'});
        let body={};
        if(req.method==='POST') {
          if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'JSON richiesto.'});
          let bytes=0, chunks=[];
          for await(const chunk of req){ bytes+=chunk.length; if(bytes>2_000_000)throw new Error('Richiesta troppo grande.'); chunks.push(chunk); }
          body=JSON.parse(Buffer.concat(chunks).toString());
        } else if(req.method!=='GET')return send(405,{error:'Metodo non consentito.'});
        switch(url.pathname) {
          case '/api/state': return send(200,{settings:settings(),history:db.prepare('SELECT * FROM history ORDER BY id DESC LIMIT 250').all(),dictionary:dictionary(),snippets:snippets(),models:listModels(),scratchpad:getKV('scratchpad',''),runtime:existsSync(join(ROOT,'vendor','transformers.min.js'))&&existsSync(join(ROOT,'vendor','ort-wasm-simd-threaded.jsep.wasm')),keys:{openai:keys.has('openai'),anthropic:keys.has('anthropic')}});
          case '/api/settings': {
            const s=body.settings;
            if(!s || !PROVIDERS.has(s.processingProvider) || !['auto','it','en','de','fr','es'].includes(s.language) || !['disabled','light','balanced','aggressive'].includes(s.fillerLevel) || !['dark','light'].includes(s.theme))throw new Error('Impostazioni non valide.');
            if(modelById(s.selectedModel).category!=='speech')throw new Error('Seleziona un modello vocale.');
            const saved={...DEFAULTS,language:s.language,processingProvider:s.processingProvider,fillerLevel:s.fillerLevel,theme:s.theme,selectedModel:s.selectedModel,cleanup:!!s.cleanup,historyEnabled:!!s.historyEnabled,openaiModel:required(s.openaiModel,200),anthropicModel:required(s.anthropicModel,200),microphone:text(s.microphone||'',1000)};
            setKV('settings',saved);return send(200,{ok:true});
          }
          case '/api/key': {
            if(!['openai','anthropic'].includes(body.provider))throw new Error('Provider non valido.');
            const key=text(body.key,4096).trim(); if(key)keys.set(body.provider,key);else keys.delete(body.provider);
            return send(200,{ok:true});
          }
          case '/api/dictionary': {
            const source=required(body.source), replacement=text(body.replacement,10000);
            if(body.id)db.prepare('UPDATE dictionary SET source=?,replacement=?,caseSensitive=? WHERE id=?').run(source,replacement,+!!body.caseSensitive,Number(body.id));
            else db.prepare('INSERT INTO dictionary(source,replacement,caseSensitive) VALUES(?,?,?)').run(source,replacement,+!!body.caseSensitive);
            return send(200,{ok:true});
          }
          case '/api/snippet': {
            const values=[required(body.name),required(body.trigger).replace(/[.!?]+$/u,''),text(body.content),text(body.category||'',1000)];
            if(body.id)db.prepare('UPDATE snippets SET name=?,trigger=?,content=?,category=? WHERE id=?').run(...values,Number(body.id));
            else db.prepare('INSERT INTO snippets(name,trigger,content,category) VALUES(?,?,?,?)').run(...values);
            return send(200,{ok:true});
          }
          case '/api/delete': {
            if(!['history','dictionary','snippets'].includes(body.table))throw new Error('Tabella non valida.');
            db.prepare(`DELETE FROM ${body.table} WHERE id=?`).run(Number(body.id));return send(200,{ok:true});
          }
          case '/api/history/clear': db.exec('DELETE FROM history'); return send(200,{ok:true});
          case '/api/history/edit':db.prepare('UPDATE history SET processed=? WHERE id=?').run(text(body.processed),Number(body.id));return send(200,{ok:true});
          case '/api/scratchpad':setKV('scratchpad',text(body.text));return send(200,{ok:true});
          case '/api/prepare':return send(200,{text:processText(text(body.text),settings(),dictionary(),snippets())});
          case '/api/history': {
            if(settings().historyEnabled)db.prepare('INSERT INTO history(original,processed,model,language,durationMs,createdAt) VALUES(?,?,?,?,?,?)').run(text(body.original),text(body.processed),text(body.model,200),settings().language,Math.max(0,Number(body.durationMs)||0),new Date().toISOString());
            return send(200,{ok:true});
          }
          case '/api/cloud': {
            const s=settings(), provider=s.processingProvider;
            if(!['openai','anthropic'].includes(provider))throw new Error('Seleziona esplicitamente un provider cloud nelle impostazioni.');
            const key=keys.get(provider);if(!key)throw new Error('Inserisci la chiave API per questa sessione nelle impostazioni.');
            const instruction=required(body.instruction,4000), input=text(body.text);
            const target=provider==='openai'?'https://api.openai.com/v1/responses':'https://api.anthropic.com/v1/messages';
            const headers=provider==='openai'?{Authorization:`Bearer ${key}`}:{'x-api-key':key,'anthropic-version':'2023-06-01'};
            const payload=provider==='openai'?{model:s.openaiModel,instructions:instruction,input,store:false}:{model:s.anthropicModel,max_tokens:1024,system:instruction,messages:[{role:'user',content:input}]};
            const remote=await fetch(target,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(120000)});
            if(!remote.ok)throw new Error(`Il provider ha risposto HTTP ${remote.status}. Controlla chiave, credito e nome del modello.`);
            const answer=await remote.json();const output=provider==='openai'?extractOpenAI(answer):(answer.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');
            if(!output)throw new Error('Il provider non ha restituito testo.');return send(200,{text:output});
          }
          case '/api/download':return send(200,job);
          case '/api/model/install': {
            if(job.status==='downloading')throw new Error('È già in corso un download.');
            const model=modelById(body.id);controller=new AbortController();job={status:'downloading',id:model.id,received:0,total:0};
            downloadModel(dataDir,model,p=>{job={...job,...p};},controller.signal).then(()=>{job={...job,status:'complete'};}).catch(e=>{job={...job,status:'error',error:e.name==='AbortError'?'Download annullato.':e.message};});
            return send(200,{ok:true});
          }
          case '/api/model/cancel':controller?.abort();return send(200,{ok:true});
          case '/api/model/verify':await verifyModel(dataDir,modelById(body.id));return send(200,{ok:true});
          case '/api/model/delete': {
            if(job.status==='downloading')throw new Error('Attendi o annulla il download prima di eliminare un modello.');
            const model=modelById(body.id);await rm(modelDir(dataDir,model),{recursive:true,force:true});return send(200,{ok:true});
          }
          default:return send(404,{error:'Operazione non disponibile.'});
        }
      }
      if(req.method!=='GET'&&req.method!=='HEAD')return send(405,{error:'Metodo non consentito.'});
      const pathname=decodeURIComponent(url.pathname);
      let base=join(ROOT,'public'), relative=pathname==='/'?'index.html':pathname.slice(1);
      if(pathname.startsWith('/vendor/')){base=join(ROOT,'vendor');relative=pathname.slice(8);}
      if(pathname.startsWith('/models/')){base=join(dataDir,'models');relative=pathname.slice(8);}
      const file=resolve(base,relative);
      if(!file.startsWith(resolve(base)+sep))return send(403,{error:'Percorso non consentito.'});
      if(!['.html','.css','.js','.mjs','.wasm','.onnx','.json','.txt'].includes(extname(file)))return send(404,{error:'File non disponibile.'});
      const info=await stat(file);
      if(!info.isFile())return send(404,{error:'File non disponibile.'});
      const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.onnx':'application/octet-stream','.txt':'text/plain'};
      res.setHeader('Content-Type',types[extname(file)]);
      res.setHeader('Cache-Control','no-store');
      if(extname(file)==='.html'){res.end((await readFile(file,'utf8')).replace('__TOKEN__',token));return;}
      res.setHeader('Content-Length',info.size);
      if(req.method==='HEAD')return res.end();
      createReadStream(file).on('error',()=>res.destroy()).pipe(res);
    } catch(e){if(!res.headersSent)send(e.code==='ENOENT'?404:400,{error:e.code==='ENOENT'?'File non installato.':e.message});else res.destroy();}
  });
  server.on('close',()=>{controller?.abort();keys.clear();db.close();});
  return new Promise((resolvePromise,reject)=>{
    server.once('error',reject);
    server.listen(port,'127.0.0.1',()=>{origin=`http://127.0.0.1:${server.address().port}`;resolvePromise({server,origin,token});});
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const {server,origin}=await startServer({port:Number(process.env.LOCALFLOW_PORT||4318)});
  console.log(`LocalFlow pronto: ${origin}\nApri questo indirizzo nel browser. Ctrl+C per chiudere.\nNessuna chiave API viene salvata su disco.`);
  process.on('SIGINT',()=>server.close());
}
