// Turns text into weighted terms: whole words, and character trigrams that make matching tolerant to typos and
// partial words ("coliders" still finds "colliders").
export function extractTerms(text: string): Map<string, number> {
  const terms = new Map<string, number>();
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1);
  for (const word of words) {
    countTerm({ terms, term: `w:${word}` });
    const padded = ` ${word} `;
    for (let start = 0; start + 3 <= padded.length; start++) countTerm({ terms, term: `t:${padded.slice(start, start + 3)}` });
  }
  return terms;
}

function countTerm({ terms, term }: { terms: Map<string, number>; term: string }): void {
  terms.set(term, (terms.get(term) ?? 0) + 1);
}
