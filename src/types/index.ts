export type RunConfig = {
  userDataDir: string;
  dryRun: boolean;
  maxActionsPerHour: number;
};

export type ActionResult = {
  type: "click" | "search" | "quiz";
  status: "ok" | "failed" | "skipped";
  attempts: number;
  durationMs: number;
  meta?: Record<string, unknown>;
};

import type { Page } from 'playwright';

export interface TaskHandler {
  name: string;
  run(page: Page): Promise<ActionResult>;
}
