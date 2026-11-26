import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, open, rename, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const CATALOG = [
  { id:'whisper-tiny', name:'Whisper Tiny', repo:'onnx-community/whisper-tiny', revision:'ff4177021cc41f7db950912b73ea4fdf7d01d8e7', task:'automatic-speech-recognition', dtype:'q8', category:'speech', size:'~45 MB', ram:'~500 MB', license:'MIT (Whisper)', description:'Rapido e multilingue. Il punto di partenza consigliato.' },
  { id:'whisper-base', name:'Whisper Base', repo:'onnx-community/whisper-base', revision:'27a07b4b52b3a4c5886134bb4320e93e1a4bbc7c', task:'automatic-speech-recognition', dtype:'q8', category:'speech', size:'~80 MB', ram:'~800 MB', license:'Apache-2.0 (repository)', description:'Più accurato, con un consumo di memoria maggiore.' },
  { id:'smollm2', name:'SmolLM2 135M', repo:'HuggingFaceTB/SmolLM2-135M-Instruct', revision:'12fd25f77366fa6b3b4b768ec3050bf629380bac', task:'text-generation', dtype:'q4', category:'text', size:'~186 MB', ram:'~600 MB', license:'Apache-2.0', description:'Modello di testo leggero, soprattutto inglese. Qualità limitata: rivedi il risultato.' },
];
export const modelDir = (root, model) => join(root, 'models', model.repo);
export function modelById(id) { const m = CATALOG.find(x => x.id === id); if (!m) throw new Error('Modello sconosciuto.'); return m; }
export const installed = (root, m) => existsSync(join(modelDir(root, m), 'installed.json'));

export async function verifyFile(path, expected, size) {
  const h = createHash(expected.algorithm);
  if (expected.algorithm === 'sha1') h.update(`blob ${size}\0`);
  let total = 0;
  for await (const chunk of createReadStream(path)) { total += chunk.length; h.update(chunk); }
  return total === size && h.digest('hex') === expected.value;
}

export async function downloadModel(root, model, progress, signal) {
  const response = await fetch(`https://huggingface.co/api/models/${model.repo}/tree/${model.revision}?recursive=true`, { signal });
  if (!response.ok) throw new Error(`Catalogo remoto non disponibile (${response.status}).`);
  const tree = await response.json();
  const weights = model.category === 'speech' ? ['onnx/encoder_model_quantized.onnx','onnx/decoder_model_merged_quantized.onnx'] : ['onnx/model_q4.onnx'];
  const files = tree.filter(f => f.type === 'file' && (weights.includes(f.path) || /^[\w.-]+\.(json|txt|md)$/.test(f.path)));
  for (const path of [...weights,'config.json','tokenizer.json','tokenizer_config.json']) {
    if (!files.some(f => f.path === path)) throw new Error(`File richiesto mancante: ${path}`);
  }
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > 800_000_000) throw new Error('Dimensione inattesa del modello: installazione interrotta.');
  let completed = 0;
  const manifest = [];
  const directory = modelDir(root, model);
  await mkdir(directory, { recursive: true });
  for (const file of files) {
    signal.throwIfAborted();
    const target = join(directory, file.path);
    const expected = { algorithm: file.lfs ? 'sha256' : 'sha1', value: file.lfs?.oid || file.oid };
    if (!expected.value) throw new Error('Checksum remoto mancante.');
    if (existsSync(target) && await verifyFile(target, expected, file.size)) {
      completed += file.size; manifest.push({ path:file.path, expected, size:file.size }); continue;
    }
    await mkdir(join(directory, file.path.includes('/') ? 'onnx' : ''), { recursive: true });
    const partial = target + '.part';
    try {
      const download = await fetch(`https://huggingface.co/${model.repo}/resolve/${model.revision}/${file.path}`, { signal });
      if (!download.ok) throw new Error(`Download ${file.path}: HTTP ${download.status}`);
      const handle = await open(partial, 'w');
      let received = 0;
      try {
        for await (const chunk of download.body) {
          signal.throwIfAborted(); received += chunk.length;
          if (received > file.size) throw new Error('Dimensione del file inattesa.');
          await handle.writeFile(chunk);
          progress({ file:file.path, received:completed + received, total });
        }
      } finally { await handle.close(); }
      if (!await verifyFile(partial, expected, file.size)) throw new Error(`Verifica integrità fallita: ${file.path}`);
      await rm(target, { force: true });
      await rename(partial, target);
      completed += file.size;
      manifest.push({ path:file.path, expected, size:file.size });
    } finally { await rm(partial, { force: true }); }
  }
  await writeFile(join(directory,'installed.json'), JSON.stringify({ revision:model.revision, files:manifest }));
  progress({ file:'Verificato', received:total, total });
}

export async function verifyModel(root, model) {
  const directory = modelDir(root,model);
  const manifest = JSON.parse(await readFile(join(directory,'installed.json'),'utf8'));
  for (const f of manifest.files) {
    if (!/^(?:onnx\/)?[\w.-]+$/.test(f.path) || !await verifyFile(join(directory,f.path),f.expected,f.size)) throw new Error('Modello danneggiato. Reinstalla il modello.');
  }
  return true;
}
