/**
 * (Re)generates data/query-bank.json from SEARCH_INTENTS.
 *
 * Usage:  pnpm run build:query-bank
 */

import { buildQueryBank } from '../src/utils/embeddings.js';

buildQueryBank().catch((err) => {
  console.error(err);
  process.exit(1);
});
