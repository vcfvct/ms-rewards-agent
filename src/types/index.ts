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

export interface TaskHandler {
  name: string;
  run(page: any): Promise<ActionResult>; // Using any for Page to avoid circular dependency for now, or I'll import Page from playwright types
}
