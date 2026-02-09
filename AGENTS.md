# Agentic Coding Guidelines for ms-rewards-agent

This document provides comprehensive instructions and standards for AI agents operating within this repository. This project is a **Microsoft Rewards Automator** built with **Node.js, TypeScript, and Playwright**.

## 1. Environment & Toolchain

### Prerequisites
- Node.js (LTS version)
- pnpm (package manager)
- Playwright

### Commands
Standard `pnpm` scripts should be maintained in `package.json`. Agents should rely on these scripts:

- **Install dependencies**: `pnpm install`
- **Build**: `pnpm run build`
- **Lint**: `pnpm run lint`
- **Format**: `pnpm run format`
- **Test (All)**: `pnpm run test`
- **Test (Single Spec)**: `pnpm exec vitest run path/to/test.ts`
- **Run (Dev)**: `pnpm run start -- --dry-run`

## 2. Code Style & Conventions

### General
- **Strict Typing**: Enable `strict: true` in `tsconfig.json`.
  - ❌ Avoid `any`.
  - ✅ Use `unknown` if necessary and narrow types via type guards.
- **Modules**: Use ES Modules (`import`/`export`).
- **Async/Await**: Prefer `async`/`await` over `.then()` chains.
- **Functional & OOP**:
  - Use **Classes** for architectural components (`BrowserAdapter`, `ClickHandler`) as defined in architecture.
  - Use **Pure Functions** for utilities (`randomDelay`, `generateMousePath`).

### Naming
- **Variables/Functions**: `camelCase` (e.g., `maxActionsPerHour`, `clickElement`).
- **Classes/Interfaces**: `PascalCase` (e.g., `BrowserAdapter`, `RunConfig`).
- **Files**: `kebab-case.ts` (e.g., `browser-adapter.ts`, `quiz-handler.ts`).
- **Constants**: `UPPER_SNAKE_CASE` for global configuration constants (e.g., `DEFAULT_USER_AGENT`).

### Imports
Organize imports in the following order, separated by a blank line:
1.  **Built-in Node modules** (`fs`, `path`, `crypto`)
2.  **External dependencies** (`playwright`, `winston`, `zod`)
3.  **Internal modules** (relative paths, e.g., `../core/browser-adapter.js`)

### Error Handling
- Use `try/catch` blocks in high-level handlers.
- **Never swallow errors** silently. Log them using the structured logger.
- Create custom error types for specific handler failures to allow for intelligent retries.
  ```ts
  export class SelectorNotFoundError extends Error {
    constructor(selector: string) {
      super(`Selector not found: ${selector}`);
      this.name = "SelectorNotFoundError";
    }
  }
  ```

## 3. Architecture & Specific Rules

### Project Structure (Target)
```
src/
  ├── core/          # Core logic (BrowserAdapter, Controller)
  ├── handlers/      # Task handlers (click, search, quiz)
  ├── utils/         # Humanizer, Logger, Storage
  ├── types/         # Shared TypeScript interfaces
  └── index.ts       # Entry point
tests/
  ├── unit/          # Vitest unit tests (mocked Playwright)
  └── integration/   # Playwright integration tests
```

### Key Type Definitions
Adhere to these shared types to maintain consistency across modules:

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
  meta?: Record<string, unknown>;
};
```

### Humanization (Critical)
This is the most important aspect of the bot to prevent detection.
- **Never** use raw Playwright `click()` or `fill()` directly in handlers.
- **Always** use humanized wrappers injected via the `BrowserAdapter` or `Humanizer` class:
  - `await humanizer.clickHuman(page, selector)`
  - `await humanizer.typeHuman(page, selector, text)`
- **Delays**: Implement random delays between *every* action.
  - Short: 800ms - 4500ms
  - Long: Occasional 30s - 120s pauses
- **Mouse Movement**: Simulate curved paths with jitter. Do not teleport the mouse.

### Safety & Limits
- **Rate Limiting**: Respect `maxActionsPerHour` config. The Controller should enforce this.
- **Dry Run**: Implement a `dry-run` mode that logs actions (e.g., "Would click #foo") without executing them.
- **Defaults**: Defaults must be conservative to protect user accounts.

### Observability
- Use a structured logger (JSON lines format).
- Log fields must include: `timestamp`, `action`, `selector`, `result` (success/fail), `durationMs`.
- Do not log sensitive user data (cookies, passwords).

## 4. Testing Guidelines

### Unit Tests (Vitest)
- Focus on logic verification.
- **Mock Playwright**: Do not launch a real browser for unit tests. Mock `Page`, `BrowserContext`, and `ElementHandle`.
- Example of mocking logic:
  ```ts
  // test/unit/click-handler.test.ts
  const mockPage = {
    waitForSelector: vi.fn().mockResolvedValue(true),
    // ...
  };
  ```

### Integration Tests (Playwright)
- Run against a local test fixture (static HTML) served locally.
- Or use a dedicated test account (never the main user's account for automated tests).
- **Test IDs**: Use `data-testid` attributes in fixtures for stability, but ensure the bot logic itself uses robust selectors (text/ARIA) to mimic real user behavior.

## 5. Documentation & Workflows

### Adding a New Handler
1.  **Define Interface**: Create a new class in `src/handlers/` implementing the `TaskHandler` interface.
2.  **Implement Logic**: Use `humanizer` methods for all interactions.
3.  **Add Unit Tests**: Mock the page and verify the handler's logic flow.
4.  **Register**: Add the handler to the `Controller` in `src/core/controller.ts`.

### Commit Messages
- Use conventional commits: `type(scope): description`.
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
- Example: `feat(quiz): implement confidence scoring for answers`

### Source of Truth
- Keep `spec.md` as the architectural source of truth.
- Update `README.md` if CLI arguments change.
