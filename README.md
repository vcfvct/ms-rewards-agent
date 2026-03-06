# MS Rewards Agent

An automated Microsoft Rewards point collector built with **Node.js**, **TypeScript**, and **Playwright**. Designed with human-like behavior patterns to safely automate daily rewards activities.

> ⚠️ **Disclaimer**: Use at your own risk. Automating Microsoft Rewards may violate their Terms of Service.

## Features

- 🖱️ **Click Handler** - Completes daily activities on the Rewards dashboard, including "Explore on Bing" cards.
- 🔎 **Semantic Explore Search** - Matches "Explore" card descriptions against an embedding-powered intent bank (`intent` -> `searchTerm`), with normalized-text fallback.
- 🧠 **Quiz Handler** - Detects and attempts available quiz/poll activities with iterative option selection.
- 📚 **Query Bank Builder** - Generates `data/query-bank.json` embeddings via a dedicated script.
- 🧪 **Query Bank Similarity Debugger** - Embed custom sentences and print top-N closest query-bank matches with scores.
- 🎭 **Humanization** - Bezier curve mouse movements, random delays, human-like typing
- 📊 **Metrics Tracking** - Tracks success rates, points earned, and handler performance
- 🔒 **Dry-Run Mode** - Test without performing real actions
- 💾 **Persistent Sessions** - Uses Edge browser profile to maintain login state

## Installation

```bash
# Install dependencies
pnpm install

# Optional: prebuild semantic query bank (otherwise auto-builds on first run)
pnpm run build:query-bank

# Optional: inspect top-N matches for custom sentences
pnpm run debug:query-bank -- --top 5 "best cheap flights"

# Build TypeScript
pnpm run build
```

## Usage

```bash
# Run with dry-run mode (safe, no real actions)
pnpm run start -- --dry-run

# View metrics summary
pnpm run start -- --metrics

# Full run (use with caution)
pnpm run start
```

### Query Bank Similarity Debugging

Use this when tuning embedding-based Explore matching.

```bash
# 1) Edit INPUT_SENTENCES in scripts/debug-query-bank.ts
pnpm run debug:query-bank

# 2) Or pass sentences directly via CLI
pnpm run debug:query-bank -- --top 8 "cheap iphone promos this week" "today nba scores"
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --dry-run` | Log actions without executing | `false` |
| `-u, --user-data-dir` | Browser profile directory | `~/.ms-rewards-agent/edge-profile` |
| `-p, --profile <name>` | Use a specific Edge profile (by display name, email, or account name) | - |
| `--list-profiles` | List available Edge profiles and exit | - |
| `-m, --max-actions` | Maximum actions per hour | `30` |
| `--skip-clicks` | Skip click activities | `false` |
| `--skip-quizzes` | Skip quiz activities | `false` |
| `--metrics` | Show metrics summary and exit | - |

### Profile Selection

By default, the agent uses an isolated browser profile at `~/.ms-rewards-agent/edge-profile`. To use your existing Edge profile (with cookies, saved logins, etc.):

1. First, close Microsoft Edge completely (Edge locks the profile directory while running)
2. List available profiles:
   ```bash
   pnpm run start -- --list-profiles
   ```
3. Run with a specific profile:
   ```bash
   pnpm run start -- --profile "vcfvct@hotmail.com" --dry-run
   ```

The `--profile` flag matches against display name, email, account name, or folder name (case-insensitive).

## Architecture

```
src/
├── index.ts              # CLI entry point & orchestration
├── core/
│   └── browser-adapter.ts    # Playwright wrapper with humanized methods
├── handlers/
│   ├── click-handler.ts      # Daily activities + Explore searches
│   └── quiz-handler.ts       # Quiz detection & answering
├── utils/
│   ├── embeddings.ts          # Embedding model + semantic query-bank matching
│   ├── edge-profiles.ts       # Edge profile scanning & selection
│   ├── humanizer.ts           # Mouse paths, delays, typing
│   ├── storage.ts             # Metrics persistence
│   └── logger.ts              # Structured JSON logging
├── scripts/
│   └── build-query-bank.ts    # Generates data/query-bank.json
├── types/
│   └── index.ts              # Shared TypeScript interfaces
└── data/
    └── query-bank.json       # Precomputed query embeddings
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI (index.ts)                          │
│  Parses args → Initializes browser → Runs handlers sequentially │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BrowserAdapter                              │
│  • Launches Edge with persistent profile                        │
│  • Provides humanized click/type methods                        │
│  • Wraps Playwright Page for all handlers                       │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
┌───────────────────────────────┐       ┌───────────────────────────────┐
│        ClickHandler           │       │          QuizHandler          │
│                               │       │                               │
│ • Navigate to rewards.bing    │       │ • Find quiz activities        │
│ • Identify "Explore" vs       │       │ • Locate answer options       │
│   standard cards              │       │ • Iterative option attempts   │
│ • Click activity              │       │ • Check completion indicators │
│ • For "Explore": semantic     │       │                               │
│   query-bank match fallback   │       │                               │
│ • If "Explore": Run search    │       │                               │
└───────────────────────────────┘       └───────────────────────────────┘
        │                                               │
        └───────────────────────┬───────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        ActionResult                             │
│  { type, status, attempts, durationMs, meta }                   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MetricsStore + Logger                        │
│  • Records run statistics to .rewards-metrics.json              │
│  • Logs structured JSON lines to .rewards.log                    │
└─────────────────────────────────────────────────────────────────┘
```

## Key Logic

### Humanization (Anti-Detection)

All interactions use human-like behavior to avoid detection:

```typescript
// Bezier curve mouse movement (not teleporting)
const path = generateMousePath(startX, startY, endX, endY);
for (const point of path) {
  await page.mouse.move(point.x, point.y);
  await randomDelay(5, 15); // Micro-delays between points
}

// Random delays between actions (800ms - 4500ms typical)
await randomDelay(minMs, maxMs);

// Human-like typing with variable speed per character
for (const char of text) {
  await page.keyboard.type(char);
  await randomDelay(50, 150);
}
```

### Contextual Search

For "Explore on Bing" cards, the agent tries semantic matching first:
1. Extracts and normalizes card description text
2. Embeds the description with `Xenova/all-MiniLM-L6-v2`
3. Finds the best cosine-similarity `intent` match in `data/query-bank.json`
4. Uses the matched `searchTerm` as the search term (fallback: normalized description/title)

### Quiz Strategy

The agent uses an iterative option-click strategy:
1. Opens detected quiz/poll activities
2. Locates answer options from known selector sets
3. Clicks through options and checks completion indicators
4. Stops when completion is detected or timeout is reached

### Rate Limiting

Respects `maxActionsPerHour` to avoid triggering rate limits:

```typescript
if (completedCount >= config.maxActionsPerHour) {
  console.log("Rate limit reached");
  break;
}
```

## Testing

```bash
# Run all tests
pnpm run test

# Run specific test file
pnpm exec vitest run tests/unit/click-handler.test.ts

# Run with coverage
pnpm exec vitest run --coverage
```

**Note**: The exact test count can change over time; use `pnpm run test` as the source of truth.

## Configuration Files

| File | Purpose |
|------|---------|
| `.rewards-metrics.json` | Persisted metrics (runs, points, success rates) |
| `.rewards.log` | Structured JSON-line log output |
| `data/query-bank.json` | Semantic query bank used for Explore search matching |
| `~/.ms-rewards-agent/edge-profile` | Default isolated Edge user-data directory |

## Development

```bash
# Lint
pnpm run lint

# Format
pnpm run format

# Build (TypeScript → JavaScript)
pnpm run build

# Run in development
pnpm run start -- --dry-run
```

## License

MIT
