/**
 * Generates data/query-bank.json by embedding each search term individually.
 *
 * Usage:  pnpm run build:query-bank
 */

import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { embed } from '../src/utils/embeddings.js';

// One concrete search term per category.
// Based on Bing Rewards "Explore on Bing" card themes historically seen:
//   shopping, flights, directions, stocks, movies, weather, restaurants,
//   sports, news, music, recipes, car rental, hotels, TV, gaming, trivia,
//   tech, travel, health, pets, home, books, celebrities, fashion, science,
//   space, cars, photography, gardening, finance, real-estate, jobs,
//   podcasts, documentaries, national parks, concerts, museums, crafts,
//   education, sustainability, languages, history, wildlife, astronomy,
//   board games, streaming, comics, anime, meditation, nutrition, skincare,
//   hairstyles, weddings, holidays, local events, amusement parks, aquariums,
//   coffee, productivity, sleep
const SEARCH_TERMS: string[] = [
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
  'best documentaries to watch',
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
];

async function main() {
  console.log(`Building query bank with ${SEARCH_TERMS.length} search terms...`);

  const bank = [];
  for (const term of SEARCH_TERMS) {
    process.stdout.write(`  Embedding: ${term}...`);
    const embedding = await embed(term);
    const trimmed = embedding.map((v) => Math.round(v * 1e6) / 1e6);
    bank.push({ query: term, embedding: trimmed });
    console.log(' done');
  }

  const thisDir = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(thisDir, '../data/query-bank.json');
  await writeFile(outPath, JSON.stringify(bank, null, 2), 'utf-8');
  console.log(`Wrote ${outPath} (${bank.length} entries)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
