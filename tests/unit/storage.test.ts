import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync, rmdirSync, readFileSync } from 'fs';
import { Storage, QACache, MetricsStore } from '../../src/utils/storage';

describe('Storage', () => {
  const testFilePath = './test-data/test-storage.json';

  beforeEach(() => {
    // Clean up test file
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
    if (existsSync(`${testFilePath}.tmp`)) {
      unlinkSync(`${testFilePath}.tmp`);
    }
  });

  afterEach(() => {
    // Clean up
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
    if (existsSync(`${testFilePath}.tmp`)) {
      unlinkSync(`${testFilePath}.tmp`);
    }
    try {
      rmdirSync('./test-data');
    } catch {
      // Ignore if not empty or doesn't exist
    }
  });

  it('should initialize with default data when file does not exist', () => {
    const storage = new Storage<{ count: number }>(testFilePath, { count: 0 });
    expect(storage.get()).toEqual({ count: 0 });
  });

  it('should set and get data', () => {
    const storage = new Storage<{ value: string }>(testFilePath, { value: '' });
    storage.set({ value: 'hello' });
    expect(storage.get()).toEqual({ value: 'hello' });
  });

  it('should update data with updater function', () => {
    const storage = new Storage<{ count: number }>(testFilePath, { count: 0 });
    storage.update(data => ({ count: data.count + 1 }));
    expect(storage.get().count).toBe(1);
  });

  it('should persist data to file', () => {
    const storage = new Storage<{ name: string }>(testFilePath, { name: '' });
    storage.set({ name: 'test' });

    // Create new instance to load from file
    const storage2 = new Storage<{ name: string }>(testFilePath, { name: '' });
    expect(storage2.get()).toEqual({ name: 'test' });
  });

  it('should create directory if it does not exist', () => {
    const nestedPath = './test-data/nested/deep/storage.json';
    const storage = new Storage<{ x: number }>(nestedPath, { x: 42 });
    storage.set({ x: 100 });
    expect(existsSync(nestedPath)).toBe(true);

    // Cleanup
    unlinkSync(nestedPath);
    rmdirSync('./test-data/nested/deep');
    rmdirSync('./test-data/nested');
  });
});

describe('QACache', () => {
  const testCachePath = './test-data/test-qa-cache.json';

  beforeEach(() => {
    if (existsSync(testCachePath)) {
      unlinkSync(testCachePath);
    }
  });

  afterEach(() => {
    if (existsSync(testCachePath)) {
      unlinkSync(testCachePath);
    }
    try {
      rmdirSync('./test-data');
    } catch {
      // Ignore
    }
  });

  it('should hash questions consistently', () => {
    const cache = new QACache(testCachePath);
    const hash1 = cache.hashQuestion('What is the capital of France?');
    const hash2 = cache.hashQuestion('What is the capital of France?');
    expect(hash1).toBe(hash2);
  });

  it('should normalize questions for hashing', () => {
    const cache = new QACache(testCachePath);
    const hash1 = cache.hashQuestion('What is the CAPITAL of France?');
    const hash2 = cache.hashQuestion('what is the capital of france?');
    expect(hash1).toBe(hash2);
  });

  it('should store and lookup QA records', () => {
    const cache = new QACache(testCachePath);
    cache.store('What color is the sky?', 2, true, ['evidence1']);

    const record = cache.lookup('What color is the sky?');
    expect(record).not.toBeNull();
    expect(record!.answerIndex).toBe(2);
    expect(record!.correct).toBe(true);
  });

  it('should return null for unknown questions', () => {
    const cache = new QACache(testCachePath);
    const record = cache.lookup('Unknown question');
    expect(record).toBeNull();
  });

  it('should not overwrite correct answers with incorrect ones', () => {
    const cache = new QACache(testCachePath);
    cache.store('Test question', 1, true);
    cache.store('Test question', 2, false);

    const record = cache.lookup('Test question');
    expect(record!.answerIndex).toBe(1); // Should keep the correct one
    expect(record!.correct).toBe(true);
  });

  it('should calculate confidence correctly', () => {
    const cache = new QACache(testCachePath);

    expect(cache.getConfidence('Unknown')).toBe(0);

    cache.store('Correct question', 0, true);
    expect(cache.getConfidence('Correct question')).toBe(1.0);

    // Store incorrect in new cache
    const cache2 = new QACache('./test-data/test-qa-cache2.json');
    cache2.store('Incorrect question', 0, false);
    expect(cache2.getConfidence('Incorrect question')).toBe(0.3);

    // Cleanup
    if (existsSync('./test-data/test-qa-cache2.json')) {
      unlinkSync('./test-data/test-qa-cache2.json');
    }
  });

  it('should provide statistics', () => {
    const cache = new QACache(testCachePath);
    cache.store('Q1', 0, true);
    cache.store('Q2', 1, true);
    cache.store('Q3', 2, false);

    const stats = cache.getStats();
    expect(stats.total).toBe(3);
    expect(stats.correct).toBe(2);
    expect(stats.incorrect).toBe(1);
  });
});

describe('MetricsStore', () => {
  const testMetricsPath = './test-data/test-metrics.json';

  beforeEach(() => {
    if (existsSync(testMetricsPath)) {
      unlinkSync(testMetricsPath);
    }
  });

  afterEach(() => {
    if (existsSync(testMetricsPath)) {
      unlinkSync(testMetricsPath);
    }
    try {
      rmdirSync('./test-data');
    } catch {
      // Ignore
    }
  });

  it('should record run metrics', () => {
    const store = new MetricsStore(testMetricsPath);
    store.recordRun('ClickHandler', 'ok', 1000, 3, { clicked: 2 });

    const data = store.export();
    expect(data.runs.length).toBe(1);
    expect(data.runs[0]!.handler).toBe('ClickHandler');
    expect(data.runs[0]!.status).toBe('ok');
  });

  it('should record daily points', () => {
    const store = new MetricsStore(testMetricsPath);
    store.recordPoints(10, 'click');
    store.recordPoints(20, 'search');

    expect(store.getTodayPoints()).toBe(30);
  });

  it('should accumulate points for same source on same day', () => {
    const store = new MetricsStore(testMetricsPath);
    store.recordPoints(10, 'click');
    store.recordPoints(15, 'click');

    const data = store.export();
    const clickPoints = data.dailyPoints.filter(d => d.source === 'click');
    expect(clickPoints.length).toBe(1);
    expect(clickPoints[0]!.points).toBe(25);
  });

  it('should calculate success rate', () => {
    const store = new MetricsStore(testMetricsPath);
    store.recordRun('TestHandler', 'ok', 100, 1);
    store.recordRun('TestHandler', 'ok', 100, 1);
    store.recordRun('TestHandler', 'failed', 100, 1);

    expect(store.getSuccessRate('TestHandler')).toBeCloseTo(0.667, 2);
  });

  it('should calculate average duration', () => {
    const store = new MetricsStore(testMetricsPath);
    store.recordRun('TestHandler', 'ok', 100, 1);
    store.recordRun('TestHandler', 'ok', 200, 1);
    store.recordRun('TestHandler', 'ok', 300, 1);

    expect(store.getAverageDuration('TestHandler')).toBe(200);
  });

  it('should provide summary statistics', () => {
    const store = new MetricsStore(testMetricsPath);
    store.recordRun('Handler1', 'ok', 100, 1);
    store.recordRun('Handler2', 'failed', 200, 2);
    store.recordPoints(50, 'quiz');

    const summary = store.getSummary();
    expect(summary.totalRuns).toBe(2);
    expect(summary.todayPoints).toBe(50);
    expect(Object.keys(summary.handlerStats)).toContain('Handler1');
    expect(Object.keys(summary.handlerStats)).toContain('Handler2');
  });

  it('should limit stored runs to prevent unbounded growth', () => {
    const store = new MetricsStore(testMetricsPath);

    // Record more than the limit (1000)
    for (let i = 0; i < 1005; i++) {
      store.recordRun('TestHandler', 'ok', 100, 1);
    }

    const data = store.export();
    expect(data.runs.length).toBeLessThanOrEqual(1000);
  });
});
