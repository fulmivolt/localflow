import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { processText, replaceWords, extractOpenAI } from '../lib/text.mjs';
import { verifyFile, modelById } from '../lib/models.mjs';
import { resample } from '../public/audio.js';
import { startServer } from '../server.mjs';

test('Dictionary supports Unicode without corrupting offsets or substrings',()=>{
  assert.equal(replaceWords('İstanbul è ACME acmeology acme_id','acme','Acme'),'İstanbul è Acme acmeology acme_id');
  assert.equal(replaceWords('CAFÉ café','café','caffè'),'caffè caffè');
  assert.equal(replaceWords('Acme ACME','ACME','Brand',true),'Acme Brand');
  assert.equal(replaceWords('text','','bad'),'text');
});
test('Snippets require a full utterance and preserve line breaks',()=>{
  const snippets=[{trigger:'la mia firma',content:'Cordiali saluti,\nMario\nAzienda'}];
  assert.equal(processText('La mia firma.',{cleanup:true},[],snippets),snippets[0].content);
  assert.equal(processText('Non usare la mia firma',{cleanup:true},[],snippets),'Non usare la mia firma');
});
test('Cleanup preserves meaningful words, paragraphs and disabled behavior',()=>{
  assert.equal(processText('um I like it\n\nBasically yes',{cleanup:true,fillerLevel:'balanced'}),'I like it\n\nBasically yes');
  assert.equal(processText('um  test',{cleanup:false}),'um  test');
});
test('OpenAI reasoning blocks are not mistaken for the output text',()=>{
  assert.equal(extractOpenAI({output:[{type:'reasoning'},{content:[{type:'output_text',text:'Corrected'}]}]}),'Corrected');
  assert.throws(()=>extractOpenAI({output:[]}));
});
test('Audio resampling retains duration and constant signal',()=>{
  const x=resample(new Float32Array(48000).fill(0.5),48000);
  assert.equal(x.length,16000);assert.ok(x.every(v=>v===0.5));
});
test('File verifier rejects corruption and supports Git blob hashes',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'localflow-integrity-'));
  try{const file=join(directory,'test'),data=Buffer.from('model');await writeFile(file,data);
    assert.equal(await verifyFile(file,{algorithm:'sha256',value:createHash('sha256').update(data).digest('hex')},data.length),true);
    assert.equal(await verifyFile(file,{algorithm:'sha256',value:'0'.repeat(64)},data.length),false);
    assert.equal(await verifyFile(file,{algorithm:'sha1',value:createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex')},data.length),true);
    assert.throws(()=>modelById('../../etc'));
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('Local server: access control, persistence, privacy and CRUD without network',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'localflow-server-'));
  let instance=await startServer({dataDir:directory,port:0});
  const request=async(path,body)=>{
    const r=await fetch(instance.origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{'X-LocalFlow-Token':instance.token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:r.status,body:await r.json()};
  };
  try{
    assert.equal((await fetch(instance.origin+'/api/state')).status,403);
    assert.equal((await fetch(instance.origin+'/api/state',{headers:{'X-LocalFlow-Token':instance.token,Origin:'https://evil.example'}})).status,403);
    assert.equal((await fetch(instance.origin+'/server.mjs')).status,404);
    assert.equal((await request('settings')).status,405);
    assert.equal((await request('cloud',{text:'private',instruction:'Polish'})).status,400);
    await request('dictionary',{source:'akme',replacement:'Acme',caseSensitive:false});
    assert.equal((await request('prepare',{text:'akme'})).body.text,'Acme');
    await request('snippet',{name:'Firma',trigger:'firma',content:'Name\nCompany',category:''});
    assert.equal((await request('prepare',{text:'Firma.'})).body.text,'Name\nCompany');
    await request('scratchpad',{text:'Saved note'});
    await request('key',{provider:'openai',key:'test-private-key'});
    let state=(await request('state')).body;
    assert.equal(state.keys.openai,true);assert.equal(JSON.stringify(state).includes('test-private-key'),false);
    await request('settings',{settings:{...state.settings,historyEnabled:false}});
    await request('history',{original:'secret',processed:'secret',model:'test',durationMs:10});
    assert.equal((await request('state')).body.history.length,0);
    await new Promise(resolve=>instance.server.close(resolve));
    instance=await startServer({dataDir:directory,port:0});
    state=(await request('state')).body;
    assert.equal(state.keys.openai,false);assert.equal(state.scratchpad,'Saved note');assert.equal(state.dictionary.length,1);
  }finally{await new Promise(resolve=>instance.server.close(resolve));await rm(directory,{recursive:true,force:true});}
});
