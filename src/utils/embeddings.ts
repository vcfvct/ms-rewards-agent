import type { FeatureExtractionPipeline, Tensor } from '@huggingface/transformers';
import { pipeline } from '@huggingface/transformers';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

interface QueryBankEntry {
  query: string;
  embedding: number[];
}

// One concrete search term per category.
// Shared by both the build script and runtime auto-build fallback.
export const SEARCH_TERMS: string[] = [
  'best iphone deals',
  'cheap flights to miami',
  'directions to Statue of Liberty',
  'msft stock price',
  'best comedy movies',
  'weather forecast this week',
  'top rated restaurants nearby',
  'nfl scores today',
  'world news headlines',
  'top songs this week',
  'easy pasta recipes',
  'car rental near me',
  'best hotel deals',
  'popular tv shows to watch',
  'best new video games',
  'fun trivia questions',
  'best smartphones 2025',
  'best vacation destinations',
  'workout routines for beginners',
  'best dog breeds for families',
  'home improvement ideas',
  'best books to read',
  'celebrity news today',
  'latest fashion trends',
  'recent science discoveries',
  'NASA space exploration',
  'best electric cars',
  'photography tips for beginners',
  'gardening tips for spring',
  'personal finance budgeting tips',
  'homes for sale near me',
  'job openings near me',
  'best podcasts to listen to',
  'best national parks to visit',
  'upcoming concerts near me',
  'best museums to visit',
  'easy craft projects',
  'free online courses',
  'sustainable living tips',
  'learn a new language online',
  'famous historical events',
  'endangered wildlife species',
  'planets in the solar system',
  'best board games for adults',
  'new movies on streaming services',
  'best manga and comics',
  'top anime series to watch',
  'guided meditation for stress',
  'healthy meal prep ideas',
  'best skincare routine',
  'trending hairstyles',
  'wedding planning checklist',
  'best holiday gift ideas',
  'local events this weekend',
  'best amusement parks',
  'largest aquariums in the world',
  'best coffee shops near me',
  'productivity tips for work',
  'how to improve sleep quality',
  'bitcoin price today',
  'yoga poses for flexibility',
  'best running shoes',
  'how to start a garden',
  'best camping gear',
  'hiking trails near me',
  'healthy smoothie recipes',
  'best comedy specials',
  'interior design ideas',
  'electric vehicle charging stations',
  'best noise cancelling headphones',
  'how to save money on groceries',
  'climate change facts',
  'best albums of the year',
  'art exhibitions near me',
  'how to learn guitar',
  'best strategy video games',
  'meal delivery services',
  'best beaches in the world',
  'how to reduce stress',
  'popular board games for kids',
  'best true crime podcasts',
  'upcoming movie releases',
  'how to train a puppy',
  'best budget laptops',
  'renewable energy sources',
  'famous landmarks around the world',
  'best online shopping sites',
  'fantasy football tips',
  'how to start investing',
  'diy home decor ideas',
  'USPS tracking',
];

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

function getQueryBankPath(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return resolve(thisDir, '../../data/query-bank.json');
}

export async function buildQueryBank(): Promise<QueryBankEntry[]> {
  console.log(`[Embeddings] Building query bank (${SEARCH_TERMS.length} terms)...`);
  const bank: QueryBankEntry[] = [];
  for (const term of SEARCH_TERMS) {
    const raw = await embed(term);
    const embedding = raw.map((v) => Math.round(v * 1e6) / 1e6);
    bank.push({ query: term, embedding });
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

  if (raw) {
    queryBankCache = JSON.parse(raw) as QueryBankEntry[];
  } else {
    queryBankCache = await buildQueryBank();
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
    `[Embeddings] Matched "${description.slice(0, 60)}" → "${bestEntry.query}" (score=${bestScore.toFixed(3)})`,
  );
  return bestEntry.query;
}
