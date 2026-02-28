import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { dirname } from 'path';
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
