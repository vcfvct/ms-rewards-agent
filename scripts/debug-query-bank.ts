/**
 * Embedding similarity debugger for data/query-bank.json.
 *
 * Edit INPUT_SENTENCES to try your own phrases, then run:
 *   pnpm run debug:query-bank
 *
 * Optional CLI overrides:
 *   pnpm run debug:query-bank -- --top 8
 *   pnpm run debug:query-bank -- "best cheap flights" "latest nfl highlights"
 */

import { cosineSimilarity, embed, loadQueryBank } from '../src/utils/embeddings.js';

const DEFAULT_TOP_K = 5;

const INPUT_SENTENCES: string[] = [
  'translate any word you want',
  'the meaning of a word you don\'t understand.​',
];

type CliOptions = {
  topK: number;
  sentences: string[];
};

function parseTopK(raw: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid --top value: "${raw}". Expected a positive integer.`);
  }
  return value;
}

function parseArgs(argv: string[]): CliOptions {
  let topK = DEFAULT_TOP_K;
  const sentences: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--top' || arg === '-k') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value after --top/-k');
      }
      topK = parseTopK(value);
      i += 1;
      continue;
    }

    if (arg.startsWith('--top=')) {
      topK = parseTopK(arg.slice('--top='.length));
      continue;
    }

    sentences.push(arg);
  }

  return { topK, sentences };
}

async function main(): Promise<void> {
  const { topK, sentences: cliSentences } = parseArgs(process.argv.slice(2));
  const sentences = cliSentences.length > 0 ? cliSentences : INPUT_SENTENCES;

  if (sentences.length === 0) {
    throw new Error('No input sentences provided. Add values to INPUT_SENTENCES or pass CLI args.');
  }

  const queryBank = await loadQueryBank();
  if (queryBank.length === 0) {
    throw new Error('Query bank is empty. Rebuild with: pnpm run build:query-bank');
  }

  const limit = Math.min(topK, queryBank.length);
  console.log(`[QueryBank Debug] Loaded ${queryBank.length} entries. Showing top ${limit}.`);

  for (const sentence of sentences) {
    const sentenceEmbedding = await embed(sentence);
    const rankedMatches = queryBank
      .map((entry) => ({
        query: entry.query,
        score: cosineSimilarity(sentenceEmbedding, entry.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    console.log('\n============================================================');
    console.log(`Input: ${sentence}`);
    for (const [index, match] of rankedMatches.entries()) {
      const rank = String(index + 1).padStart(2, ' ');
      console.log(`${rank}. score=${match.score.toFixed(4)}  query="${match.query}"`);
    }
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[QueryBank Debug] Failed: ${message}`);
  process.exit(1);
});
