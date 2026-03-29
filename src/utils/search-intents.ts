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
  { intent: "direct you to your next", searchTerm: "direction to white house" },
  { intent: "find the latest currency conversion", searchTerm: "usd to rmb" },
  {
    intent: "rental cars",
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
  {
    intent: "search for flight deals for vacation",
    searchTerm: "cheap flights to iad",
  },
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
  {
    intent: "your favorite video game",
    searchTerm: "Startcraft remastered",
  },
];
