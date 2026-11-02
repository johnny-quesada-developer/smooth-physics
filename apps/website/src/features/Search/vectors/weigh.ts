// TF-IDF weights of a term count, normalized to unit length so the dot product of two vectors is their cosine.
import type { SparseVector } from './types';

const WORD_WEIGHT = 1;
const TRIGRAM_WEIGHT = 0.35;

export function weigh({
  terms,
  vocabulary,
  inverseDocumentFrequency,
}: {
  terms: ReadonlyMap<string, number>;
  vocabulary: Readonly<Record<string, number>>;
  inverseDocumentFrequency: readonly number[];
}): SparseVector {
  const weights = new Map<number, number>();
  let squaredLength = 0;
  for (const [term, frequency] of terms) {
    const index = vocabulary[term];
    if (index === undefined) continue;
    const weight = (term.startsWith('t:') ? TRIGRAM_WEIGHT : WORD_WEIGHT) * (1 + Math.log(frequency)) * (inverseDocumentFrequency[index] ?? 0);
    weights.set(index, weight);
    squaredLength += weight * weight;
  }
  const length = Math.sqrt(squaredLength) || 1;
  const vector: Record<number, number> = {};
  for (const [index, weight] of weights) vector[index] = roundWeight(weight / length);
  return vector;
}

export function roundWeight(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
