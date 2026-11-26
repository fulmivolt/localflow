const word = /[\p{L}\p{N}_]/u;
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function replaceWords(text, source, replacement, caseSensitive = false) {
  if (!source) return text;
  return text.replace(new RegExp(escape(source), caseSensitive ? 'gu' : 'giu'), (match, offset) => {
    const before = Array.from(text.slice(0, offset)).at(-1) || '';
    const after = Array.from(text.slice(offset + match.length))[0] || '';
    return word.test(before) || word.test(after) ? match : replacement;
  });
}

export function processText(text, settings, dictionary = [], snippets = []) {
  let result = text;
  for (const d of dictionary) result = replaceWords(result, d.source, d.replacement, d.caseSensitive);
  const normalized = result.trim().replace(/[.!?]+$/u, '').trim().toLocaleLowerCase();
  const matches = snippets.filter(s => s.trigger.trim().toLocaleLowerCase() === normalized);
  // An exact, unambiguous whole-utterance trigger only. Preserve every newline.
  if (matches.length === 1) return matches[0].content;
  if (!settings.cleanup || settings.fillerLevel === 'disabled') return result;
  const fillers = settings.fillerLevel === 'light' ? ['um', 'uh'] : ['um', 'uh', 'erm', 'ehm'];
  for (const filler of fillers) result = replaceWords(result, filler, '');
  return result.split('\n').map(line => line.replace(/[\t ]+/g, ' ').trim()).join('\n').trim();
}

export function extractOpenAI(body) {
  const text = (body.output || []).flatMap(item => item.content || [])
    .filter(item => item.type === 'output_text').map(item => item.text).join('\n').trim();
  if (!text) throw new Error('Il provider non ha restituito testo. Controlla modello e permessi della chiave.');
  return text;
}
