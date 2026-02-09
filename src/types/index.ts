export type RunConfig = {
  userDataDir: string;
  dryRun: boolean;
  maxActionsPerHour: number;
  randomSeed?: number;
};

export type ActionResult = {
  type: "click" | "search" | "quiz";
  status: "ok" | "failed" | "skipped";
  attempts: number;
  durationMs: number;
  meta?: Record<string, unknown>;
};

export type QARecord = {
  questionHash: string;
  answerIndex: number;
  correct: boolean;
  evidence?: string[];
};

import { Page } from 'playwright';

export interface TaskHandler {
  name: string;
  run(page: Page): Promise<ActionResult>;
}
