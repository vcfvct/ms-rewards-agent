import type { FeatureExtractionPipeline, Tensor } from '@huggingface/transformers';
import { pipeline } from '@huggingface/transformers';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SEARCH_INTENTS } from './search-intents';
export type { SearchIntent } from './search-intents';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

interface QueryBankEntry {
  intent: string;
  searchTerm: string;
  embedding: number[];
}

interface QuestionAnswerQueryBankEntry {
  question: string;
  answer: string;
  embedding: number[];
}

interface LegacyQueryBankEntry {
  query: string;
  embedding: number[];
}

// ---------------------------------------------------------------------------
// Lazy singleton embedder
// ---------------------------------------------------------------------------

let embedderPromise: Promise<FeatureExtractionPipeline> | null = null;

export function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (!embedderPromise) {
    const extractor = pipeline('feature-extraction', MODEL_ID, {
      dtype: 'fp32',
    }) as unknown;
    embedderPromise = extractor as Promise<FeatureExtractionPipeline>;
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

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number');
}

function parseStoredEntry(
  value: unknown,
): { entry: QueryBankEntry; isLegacy: boolean } | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<
    QueryBankEntry &
    QuestionAnswerQueryBankEntry &
    LegacyQueryBankEntry
  >;

  if (
    typeof candidate.intent === 'string' &&
    typeof candidate.searchTerm === 'string' &&
    isNumberArray(candidate.embedding)
  ) {
    return {
      entry: {
        intent: candidate.intent,
        searchTerm: candidate.searchTerm,
        embedding: candidate.embedding,
      },
      isLegacy: false,
    };
  }

  if (
    typeof candidate.question === 'string' &&
    typeof candidate.answer === 'string' &&
    isNumberArray(candidate.embedding)
  ) {
    return {
      entry: {
        intent: candidate.question,
        searchTerm: candidate.answer,
        embedding: candidate.embedding,
      },
      // Consider question/answer as compatible legacy, no forced rebuild required.
      isLegacy: false,
    };
  }

  if (typeof candidate.query === 'string' && isNumberArray(candidate.embedding)) {
    return {
      entry: {
        intent: candidate.query,
        searchTerm: candidate.query,
        embedding: candidate.embedding,
      },
      isLegacy: true,
    };
  }

  return null;
}

function parseStoredQueryBank(raw: string): { entries: QueryBankEntry[]; hasLegacyEntries: boolean } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) return null;

  const entries: QueryBankEntry[] = [];
  let hasLegacyEntries = false;
  for (const item of parsed) {
    const parsedEntry = parseStoredEntry(item);
    if (!parsedEntry) return null;
    entries.push(parsedEntry.entry);
    hasLegacyEntries = hasLegacyEntries || parsedEntry.isLegacy;
  }

  return { entries, hasLegacyEntries };
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function getQueryBankPath(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return resolve(thisDir, '../../data/query-bank.json');
}

export async function buildQueryBank(): Promise<QueryBankEntry[]> {
  console.log(`[Embeddings] Building query bank (${SEARCH_INTENTS.length} intents)...`);
  const bank: QueryBankEntry[] = [];
  for (const intent of SEARCH_INTENTS) {
    const raw = await embed(intent.intent);
    const embedding = raw.map((v) => Math.round(v * 1e6) / 1e6);
    bank.push({
      intent: intent.intent,
      searchTerm: intent.searchTerm,
      embedding,
    });
  }
  const bankPath = getQueryBankPath();
  await mkdir(dirname(bankPath), { recursive: true });
  await writeFile(bankPath, JSON.stringify(bank, null, 2), 'utf-8');
  console.log(`[Embeddings] Wrote ${bankPath} (${bank.length} entries)`);
  return bank;
}

export async function loadQueryBank(): Promise<QueryBankEntry[]> {
  if (queryBankCache) return queryBankCache;

  const bankPath = getQueryBankPath();
  let raw: string | undefined;
  try {
    raw = await readFile(bankPath, 'utf-8');
  } catch {
    // File missing — auto-build on first run
  }

  if (!raw) {
    queryBankCache = await buildQueryBank();
    return queryBankCache;
  }

  const parsed = parseStoredQueryBank(raw);
  if (!parsed) {
    console.warn('[Embeddings] Invalid query bank format detected. Rebuilding from source intents...');
    queryBankCache = await buildQueryBank();
    return queryBankCache;
  }

  queryBankCache = parsed.entries;
  if (parsed.hasLegacyEntries) {
    console.log('[Embeddings] Legacy query-only query-bank format detected. Rebuilding with intent/searchTerm schema...');
    try {
      queryBankCache = await buildQueryBank();
    } catch (err) {
      console.warn(`[Embeddings] Failed to rebuild legacy query bank. Using legacy entries: ${formatError(err)}`);
    }
  }

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
    `[Embeddings] Matched "${description.slice(0, 60)}" → intent="${bestEntry.intent}" searchTerm="${bestEntry.searchTerm}" (score=${bestScore.toFixed(3)})`,
  );
  return bestEntry.searchTerm;
}
