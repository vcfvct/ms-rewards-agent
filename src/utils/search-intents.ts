export interface SearchIntent {
  intent: string;
  searchTerm: string;
}

// Common search intentions and canonical search answers.
// We embed `intent` and return `searchTerm` when matched.
export const SEARCH_INTENTS: SearchIntent[] = [
  // Community-observed card themes: "Get creative", "Search for directions",
  // and package tracking prompts from Explore on Bing discussions.
  { intent: "find scrapbooking supplies", searchTerm: "scrapbooking supplies" },
  { intent: "search for directions", searchTerm: "map to Yellowstone" },
  {
    intent: "plan your next adventure",
    searchTerm: "map to nearest national park",
  },
  {
    intent: "book rental cars for your next adventure",
    searchTerm: "car rental near me",
  },
  { intent: "track your packages", searchTerm: "USPS package tracking" },
  { intent: "the upcoming weather", searchTerm: "weather forecast this week" },
  {
    intent: "translate a word you do not know",
    searchTerm: 'translation of word "hello" in japanese',
  },
  {
    intent: "meaning of a word you do not understand",
    searchTerm: 'meaning of word "serendipity"',
  },
  { intent: "search for flight deals", searchTerm: "cheap flights to iad" },
  { intent: "search smoothie recipes", searchTerm: "healthy smoothie recipes" },
  {
    intent: "search for diy home decor ideas",
    searchTerm: "diy home decor ideas",
  },
  { intent: "check stock price", searchTerm: "msft stock price" },
  {
    intent: "what time it is in a different time zone",
    searchTerm: "current time in Tokyo time zone",
  },
  {
    intent: "lyrics of your favorite song",
    searchTerm: 'Song "my heart will go on" lyrics',
  },
  {
    intent: "your favorite movie",
    searchTerm: 'movie "Avatar:  Fire and Ash"',
  },
];
