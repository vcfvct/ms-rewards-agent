import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { dirname } from 'path';
import type { QARecord } from '../types';

/**
 * Simple JSON-backed storage for QA cache and logs.
 * Uses atomic writes to prevent data corruption.
 */
export class Storage<T> {
  private data: T;
  private filePath: string;

  constructor(filePath: string, defaultData: T) {
    this.filePath = filePath;
    this.data = this.load(defaultData);
  }

  private load(defaultData: T): T {
    try {
      if (existsSync(this.filePath)) {
        const content = readFileSync(this.filePath, 'utf-8');
        return JSON.parse(content) as T;
      }
    } catch (error) {
      console.error(`[Storage] Failed to load ${this.filePath}:`, error);
    }
    return defaultData;
  }

  get(): T {
    return this.data;
  }

  set(data: T): void {
    this.data = data;
    this.save();
  }

  update(updater: (data: T) => T): void {
    this.data = updater(this.data);
    this.save();
  }

  private save(): void {
    try {
      // Ensure directory exists
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Atomic write: write to temp file first, then rename
      const tempPath = `${this.filePath}.tmp`;
      writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');

      // Rename is atomic on most filesystems
      renameSync(tempPath, this.filePath);
    } catch (error) {
      console.error(`[Storage] Failed to save ${this.filePath}:`, error);
    }
  }
}

/**
 * QA Cache for storing question-answer pairs and their correctness.
 * Uses question hash as key for fast lookup.
 */
export class QACache {
  private storage: Storage<Record<string, QARecord>>;

  constructor(filePath: string = './data/qa-cache.json') {
    this.storage = new Storage(filePath, {});
  }

  /**
   * Creates a hash from a question string for consistent lookup.
   */
  hashQuestion(question: string): string {
    // Simple hash: normalize and create a basic hash
    const normalized = question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Simple string hash (djb2 algorithm)
    let hash = 5381;
    for (let i = 0; i < normalized.length; i++) {
      hash = ((hash << 5) + hash) + normalized.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Looks up a cached answer for a question.
   */
  lookup(question: string): QARecord | null {
    const hash = this.hashQuestion(question);
    const cache = this.storage.get();
    return cache[hash] || null;
  }

  /**
   * Stores a QA record in the cache.
   */
  store(question: string, answerIndex: number, correct: boolean, evidence?: string[]): void {
    const hash = this.hashQuestion(question);
    const record: QARecord = {
      questionHash: hash,
      answerIndex,
      correct,
      evidence,
    };

    this.storage.update(cache => {
      // If we already have a correct answer, don't overwrite with incorrect
      const existing = cache[hash];
      if (existing?.correct && !correct) {
        return cache;
      }
      return { ...cache, [hash]: record };
    });
  }

  /**
   * Gets the confidence score for a cached answer (based on correctness history).
   */
  getConfidence(question: string): number {
    const record = this.lookup(question);
    if (!record) return 0;
    return record.correct ? 1.0 : 0.3;
  }

  /**
   * Exports the cache for backup/analysis.
   */
  export(): Record<string, QARecord> {
    return this.storage.get();
  }

  /**
   * Gets cache statistics.
   */
  getStats(): { total: number; correct: number; incorrect: number } {
    const cache = this.storage.get();
    const records = Object.values(cache);
    return {
      total: records.length,
      correct: records.filter(r => r.correct).length,
      incorrect: records.filter(r => !r.correct).length,
    };
  }
}

/**
 * Metrics storage for tracking handler performance.
 */
export interface MetricsData {
  runs: RunMetric[];
  dailyPoints: DailyPoints[];
}

export interface RunMetric {
  timestamp: string;
  handler: string;
  status: 'ok' | 'failed' | 'skipped';
  durationMs: number;
  attempts: number;
  meta?: Record<string, unknown>;
}

export interface DailyPoints {
  date: string;
  points: number;
  source: 'click' | 'search' | 'quiz';
}

export class MetricsStore {
  private storage: Storage<MetricsData>;

  constructor(filePath: string = './data/metrics.json') {
    this.storage = new Storage(filePath, { runs: [], dailyPoints: [] });
  }

  /**
   * Records a handler run result.
   */
  recordRun(handler: string, status: 'ok' | 'failed' | 'skipped', durationMs: number, attempts: number, meta?: Record<string, unknown>): void {
    this.storage.update(data => ({
      ...data,
      runs: [
        ...data.runs.slice(-999), // Keep last 1000 runs
        {
          timestamp: new Date().toISOString(),
          handler,
          status,
          durationMs,
          attempts,
          meta,
        },
      ],
    }));
  }

  /**
   * Records daily points earned.
   */
  recordPoints(points: number, source: 'click' | 'search' | 'quiz'): void {
    const today = new Date().toISOString().split('T')[0]!;

    this.storage.update(data => {
      const existingIndex = data.dailyPoints.findIndex(
        d => d.date === today && d.source === source
      );

      if (existingIndex >= 0) {
        const updated = [...data.dailyPoints];
        updated[existingIndex] = {
          ...updated[existingIndex]!,
          points: updated[existingIndex]!.points + points,
        };
        return { ...data, dailyPoints: updated };
      }

      return {
        ...data,
        dailyPoints: [
          ...data.dailyPoints.slice(-365), // Keep last year
          { date: today, points, source },
        ],
      };
    });
  }

  /**
   * Gets success rate for a handler.
   */
  getSuccessRate(handler: string): number {
    const runs = this.storage.get().runs.filter(r => r.handler === handler);
    if (runs.length === 0) return 0;

    const successful = runs.filter(r => r.status === 'ok').length;
    return successful / runs.length;
  }

  /**
   * Gets average duration for a handler.
   */
  getAverageDuration(handler: string): number {
    const runs = this.storage.get().runs.filter(r => r.handler === handler);
    if (runs.length === 0) return 0;

    const totalDuration = runs.reduce((sum, r) => sum + r.durationMs, 0);
    return totalDuration / runs.length;
  }

  /**
   * Gets total points for today.
   */
  getTodayPoints(): number {
    const today = new Date().toISOString().split('T')[0];
    const data = this.storage.get();
    return data.dailyPoints
      .filter(d => d.date === today)
      .reduce((sum, d) => sum + d.points, 0);
  }

  /**
   * Gets summary statistics.
   */
  getSummary(): {
    totalRuns: number;
    successRate: number;
    avgDuration: number;
    todayPoints: number;
    handlerStats: Record<string, { runs: number; successRate: number; avgDuration: number }>;
  } {
    const data = this.storage.get();
    const runs = data.runs;

    const handlers = [...new Set(runs.map(r => r.handler))];
    const handlerStats: Record<string, { runs: number; successRate: number; avgDuration: number }> = {};

    for (const handler of handlers) {
      const handlerRuns = runs.filter(r => r.handler === handler);
      const successful = handlerRuns.filter(r => r.status === 'ok').length;
      const totalDuration = handlerRuns.reduce((sum, r) => sum + r.durationMs, 0);

      handlerStats[handler] = {
        runs: handlerRuns.length,
        successRate: handlerRuns.length > 0 ? successful / handlerRuns.length : 0,
        avgDuration: handlerRuns.length > 0 ? totalDuration / handlerRuns.length : 0,
      };
    }

    const successful = runs.filter(r => r.status === 'ok').length;
    const totalDuration = runs.reduce((sum, r) => sum + r.durationMs, 0);

    return {
      totalRuns: runs.length,
      successRate: runs.length > 0 ? successful / runs.length : 0,
      avgDuration: runs.length > 0 ? totalDuration / runs.length : 0,
      todayPoints: this.getTodayPoints(),
      handlerStats,
    };
  }

  /**
   * Exports all metrics data.
   */
  export(): MetricsData {
    return this.storage.get();
  }
}
