import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const directory = fileURLToPath(new URL('../vendor/', import.meta.url));
// Pinned browser-only artifacts. No npm lifecycle scripts or native binaries.
const files = [
  ['transformers.min.js','qlACtw54l5jaJj9fmcYr0+j80MEZJYpJPEDBgGSDZfo='],
  ['ort-wasm-simd-threaded.jsep.mjs','CPuG7EM8eL+wMsXYSmi46OWo2BJo+jniQxQXmldnpbk='],
  ['ort-wasm-simd-threaded.jsep.wasm','xGZV6KlK/EUzjUyyuEBHX4jlAS1SRQmRblBQecAL+jk='],
];
await mkdir(directory,{recursive:true});
for (const [name, hash] of files) {
  console.log(`Download ${name}…`);
  const response = await fetch(`https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/${name}`, { signal:AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('base64') !== hash) throw new Error(`Checksum non valido: ${name}`);
  const partial = join(directory,name+'.part');
  await writeFile(partial,bytes); await rm(join(directory,name),{force:true}); await rename(partial,join(directory,name));
}
console.log('Runtime JavaScript/WebAssembly verificato. Avvia con npm start. I modelli si installano dalla libreria.');
