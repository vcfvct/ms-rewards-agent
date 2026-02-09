# Spec: Microsoft Rewards Automator — Node.js Playwright (TypeScript)

## Purpose

Concise, machine‑readable spec for an LLM agent to generate a Playwright + TypeScript project that automates Microsoft Rewards activities: click-only, search-based, and short quizzes. Focus: modular handlers, persistent logged‑in session, humanization, observability, and conservative safety defaults.

## Quick verdict

Use Playwright + TypeScript. It provides robust DOM/network control, easy session reuse (persistent context or remote debugging), better testability, and richer humanization than an in‑browser userscript. Use a small test account and conservative defaults to reduce account risk.

## Architecture

Component Responsibility
Controller Orchestrates runs, enforces rate limits, schedules tasks.
BrowserAdapter Attach/launch persistent Playwright context; expose helpers.
Handlers clickHandler, searchHandler, quizHandler (modular).
Humanizer Random delays, type simulation, mouse paths, jitter.
Storage Local JSON/SQLite for logs, QA cache, metrics.
CLI / Config Modes: dry-run, test-account, limits, seed.
Interfaces & key types (TypeScript)

```ts
type RunConfig = {
  userDataDir: string;
  dryRun: boolean;
  maxActionsPerHour: number;
  randomSeed?: number;
};

type ActionResult = {
  type: "click" | "search" | "quiz";
  status: "ok" | "failed" | "skipped";
  attempts: number;
  durationMs: number;
  meta?: Record<string, any>;
};

type QARecord = {
  questionHash: string;
  answerIndex: number;
  correct: boolean;
  evidence?: string[];
};
```

## Task handlers (behavioral spec)

### Click-only handler

Find activity by selector heuristics (text patterns, ARIA).

Humanize: move mouse path → small pause → click (press/release).

Verify: detect DOM change or points increment; retry up to 2 times.

Output: ActionResult with points_gained if available.

### Search handler

Inputs: count, queryPool.

Behavior:

Pick varied queries from templates; typeLikeHuman then submit.

Wait for results; optionally click 0–2 organic results and “read” (3–8s).

Close tabs and return to Bing.

Safety: randomized inter‑search delay; limit per hour.

### Quiz handler

- Flow:

Scrape question + choices; normalize text.

For each choice, build targeted search queries (1–3).

Run searches; score choices by snippet frequency / exact matches.

If confidence >= 0.6 choose top; else consult cache; else pick plausible random.

Submit, record correctness, update cache.

- Cache: store QARecord to improve accuracy over time.

## Humanization & safety rules

Delays: randomDelay(min=800ms, max=4500ms) between actions; occasional long pause (30–120s).

Mouse: simulate curved paths with jitter; avoid teleport clicks.

Typing: per-character delay with occasional backspace/jitter.

Rate limits: default maxActionsPerHour = 30; configurable.

Dry-run: default off; require explicit --confirm to run on main account.

Warning: include TOS risk acknowledgement step before any real run.

## Observability & testing

Logging: structured JSON lines: timestamp, action, selector/query, result, stack trace.

Metrics: success rate per handler, avg time, daily points.

Tests:

- Unit: mock Playwright Page for handlers.

- Integration: run against a test account with deterministic fixtures.

Modes: dry-run (log only), test (use test account), prod (user confirms).

## LLM agent prompts (concise, actionable)

Create project skeleton

Prompt: Generate a Node.js TypeScript Playwright repo with tsconfig, package.json, playwright setup, and CLI that accepts --userDataDir, --dryRun, --maxActionsPerHour.

Implement BrowserAdapter

Prompt: Implement BrowserAdapter that attaches to userDataDir persistent context, exposes find, clickHuman, typeHuman, screenshot, and logs actions.

Implement handlers

Prompt: Implement clickHandler, searchHandler, quizHandler per specs above; include retries, verification, and structured ActionResult.

Humanizer utilities

Prompt: Implement randomDelay, typeLikeHuman, moveMousePath with seedable RNG.

Storage & cache

Prompt: Implement simple JSON-backed store with atomic writes for logs and QA cache; provide export script.

Tests

Prompt: Add unit tests mocking Playwright Page and an integration test that runs in dry-run mode against a sample HTML fixture.

## Deliverables & milestones (minimal)

M1 Repo skeleton + BrowserAdapter + CLI (dry-run).

M2 Click handler + humanizer + unit tests.

M3 Search handler + query pool + integration dry-run.

M4 Quiz handler + QA cache + metrics.

M5 Test account integration, conservative rollout docs.
