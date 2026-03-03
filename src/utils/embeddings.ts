import type { FeatureExtractionPipeline, Tensor } from '@huggingface/transformers';
import { pipeline } from '@huggingface/transformers';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

interface QueryBankEntry {
  query: string;
  embedding: number[];
}

// ---------------------------------------------------------------------------
// Lazy singleton embedder
// ---------------------------------------------------------------------------

let embedderPromise: Promise<FeatureExtractionPipeline> | null = null;

export function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (!embedderPromise) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const p: any = pipeline('feature-extraction', MODEL_ID, { dtype: 'fp32' });
    embedderPromise = p as Promise<FeatureExtractionPipeline>;
  }
  return embedderPromise;
}

// ---------------------------------------------------------------------------
// Embed a single text → normalised 384-dim vector
// ---------------------------------------------------------------------------

export async function embed(text: string): Promise<number[]> {
  const extractor = await getEmbedder();
  const output: Tensor = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

// ---------------------------------------------------------------------------
// Cosine similarity
// ---------------------------------------------------------------------------

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// Query bank loader (cached)
// ---------------------------------------------------------------------------

let queryBankCache: QueryBankEntry[] | null = null;

export async function loadQueryBank(): Promise<QueryBankEntry[]> {
  if (queryBankCache) return queryBankCache;

  const thisDir = dirname(fileURLToPath(import.meta.url));
  const bankPath = resolve(thisDir, '../../data/query-bank.json');
  const raw = await readFile(bankPath, 'utf-8');
  queryBankCache = JSON.parse(raw) as QueryBankEntry[];
  return queryBankCache;
}

// ---------------------------------------------------------------------------
// Match a card description against the query bank
// ---------------------------------------------------------------------------

export async function matchQueryBank(
  description: string,
  threshold = 0.45,
): Promise<string | null> {
  const bank = await loadQueryBank();
  const descVec = await embed(description);

  let bestScore = -Infinity;
  let bestEntry: QueryBankEntry | null = null;

  for (const entry of bank) {
    const score = cosineSimilarity(descVec, entry.embedding);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  if (!bestEntry || bestScore < threshold) return null;

  console.log(
    `[Embeddings] Matched "${description.slice(0, 60)}" → "${bestEntry.query}" (score=${bestScore.toFixed(3)})`,
  );
  return bestEntry.query;
}
