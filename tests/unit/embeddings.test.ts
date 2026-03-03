import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cosineSimilarity } from '../../src/utils/embeddings';

// Mock the heavy dependencies so tests run instantly without downloading models
vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const v = [1, 0, 0];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1);
  });

  it('should return 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
  });

  it('should return -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('should throw on dimension mismatch', () => {
    expect(() => cosineSimilarity([1, 0], [1, 0, 0])).toThrow('Dimension mismatch');
  });

  it('should return 0 when a vector is all zeros', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });
});

describe('matchQueryBank', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return the best matching search term above threshold', async () => {
    const { readFile } = await import('node:fs/promises');
    const bank = [
      { query: 'iphone deals', embedding: [1, 0, 0] },
      { query: 'iad to sfo flights', embedding: [0, 1, 0] },
    ];
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(bank));

    // Embed returns [1, 0, 0] → closest to "iphone deals"
    const transformers = await import('@huggingface/transformers');
    (vi.mocked(transformers.pipeline) as any).mockResolvedValue(
      vi.fn().mockResolvedValue({ data: new Float32Array([1, 0, 0]) }),
    );

    vi.resetModules();
    const { matchQueryBank } = await import('../../src/utils/embeddings');

    const result = await matchQueryBank('find the best shopping deal');
    expect(result).toBe('iphone deals');
  });

  it('should return null when below threshold', async () => {
    const { readFile } = await import('node:fs/promises');
    const bank = [
      { query: 'iphone deals', embedding: [1, 0, 0] },
    ];
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(bank));

    // Embed returns orthogonal vector → similarity ≈ 0
    const transformers = await import('@huggingface/transformers');
    (vi.mocked(transformers.pipeline) as any).mockResolvedValue(
      vi.fn().mockResolvedValue({ data: new Float32Array([0, 1, 0]) }),
    );

    vi.resetModules();
    const { matchQueryBank } = await import('../../src/utils/embeddings');

    const result = await matchQueryBank('something totally unrelated', 0.5);
    expect(result).toBeNull();
  });
});
