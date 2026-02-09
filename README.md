# MS Rewards Agent

An automated Microsoft Rewards point collector built with **Node.js**, **TypeScript**, and **Playwright**. Designed with human-like behavior patterns to safely automate daily rewards activities.

> ⚠️ **Disclaimer**: Use at your own risk. Automating Microsoft Rewards may violate their Terms of Service.

## Features

- 🖱️ **Click Handler** - Completes daily activities on the Rewards dashboard, including "Explore on Bing" cards.
- 🔎 **Contextual Search** - Automatically handles "Explore" activities by searching for the specific content described in the card.
- 🧠 **Quiz Handler** - Answers quizzes using a robust brute-force strategy (tries answers until correct) to ensure completion.
- 🎭 **Humanization** - Bezier curve mouse movements, random delays, human-like typing
- 📊 **Metrics Tracking** - Tracks success rates, points earned, and handler performance
- 🔒 **Dry-Run Mode** - Test without performing real actions
- 💾 **Persistent Sessions** - Uses Edge browser profile to maintain login state

## Installation

```bash
# Install dependencies
pnpm install

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

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --dry-run` | Log actions without executing | `false` |
| `-u, --user-data-dir` | Browser profile directory | `./user_data` |
| `-m, --max-actions` | Maximum actions per hour | `30` |
| `--skip-clicks` | Skip click activities | `false` |
| `--skip-quizzes` | Skip quiz activities | `false` |
| `--metrics` | Show metrics summary and exit | - |

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
│   ├── humanizer.ts          # Mouse paths, delays, typing
│   ├── storage.ts            # QA cache & metrics persistence
│   └── logger.ts             # Structured JSON logging
└── types/
    └── index.ts              # Shared TypeScript interfaces
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
│ • Identify "Explore" vs       │       │ • Detect quiz type            │
│   standard cards              │       │ • Brute-force/Backtrack logic │
│ • Click activity              │       │ • Cache successful answers    │
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
│  • Logs structured JSON to data/logs/agent.jsonl                │
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

For "Explore on Bing" cards, the agent extracts the description text from the card and uses it as the search query. This ensures the search is relevant to the required task.

### Quiz Strategy

The agent uses a robust iterative approach for quizzes:
1.  **Iterate**: Attempts to answer questions efficiently.
2.  **Retry**: If an answer is incorrect, it retries immediately until the correct option is found.
3.  **Completion**: Monitors the quiz progress indicator until 100% completion is detected to ensure full points.

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

**Test Coverage**: 104 tests across 9 test files covering handlers, utilities, and integration scenarios.

## Configuration Files

| File | Purpose |
|------|---------|
| `.rewards-metrics.json` | Persisted metrics (runs, points, success rates) |
| `.rewards-qa-cache.json` | Cached quiz Q&A pairs for learning |
| `data/logs/agent.jsonl` | Structured JSON log output |
| `user_data/` | Edge browser profile (cookies, session) |

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
