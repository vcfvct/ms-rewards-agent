import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cosineSimilarity } from '../../src/utils/embeddings';

// Mock heavy dependencies to avoid downloading models in tests
vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

type PipelineMock = {
  mockResolvedValue: (value: unknown) => unknown;
  mockRejectedValue: (value: unknown) => unknown;
};

function getPipelineMock(transformers: typeof import('@huggingface/transformers')): PipelineMock {
  return vi.mocked(transformers.pipeline) as unknown as PipelineMock;
}

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
      {
        intent: 'find the best iphone discounts',
        searchTerm: 'best iphone deals',
        embedding: [1, 0, 0],
      },
      {
        intent: 'look for cheap flights today',
        searchTerm: 'cheap flights to miami',
        embedding: [0, 1, 0],
      },
    ];
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(bank));

    const transformers = await import('@huggingface/transformers');
    getPipelineMock(transformers).mockResolvedValue(
      vi.fn().mockResolvedValue({ data: new Float32Array([1, 0, 0]) }),
    );

    vi.resetModules();
    const { matchQueryBank } = await import('../../src/utils/embeddings');

    const result = await matchQueryBank('find the best shopping deal');
    expect(result).toBe('best iphone deals');
  });

  it('should return null when below threshold', async () => {
    const { readFile } = await import('node:fs/promises');
    const bank = [
      {
        intent: 'find iphone discounts',
        searchTerm: 'best iphone deals',
        embedding: [1, 0, 0],
      },
    ];
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(bank));

    const transformers = await import('@huggingface/transformers');
    getPipelineMock(transformers).mockResolvedValue(
      vi.fn().mockResolvedValue({ data: new Float32Array([0, 1, 0]) }),
    );

    vi.resetModules();
    const { matchQueryBank } = await import('../../src/utils/embeddings');

    const result = await matchQueryBank('something totally unrelated', 0.5);
    expect(result).toBeNull();
  });

  it('should auto-build query bank when file is missing', async () => {
    const fsp = await import('node:fs/promises');
    vi.mocked(fsp.readFile).mockRejectedValue(new Error('ENOENT'));

    const transformers = await import('@huggingface/transformers');
    getPipelineMock(transformers).mockResolvedValue(
      vi.fn().mockResolvedValue({ data: new Float32Array([0.5, 0.5, 0.5]) }),
    );

    vi.resetModules();
    const { loadQueryBank } = await import('../../src/utils/embeddings');

    const bank = await loadQueryBank();
    expect(bank.length).toBeGreaterThan(0);
    expect(bank[0]).toHaveProperty('intent');
    expect(bank[0]).toHaveProperty('searchTerm');
    expect(bank[0]).toHaveProperty('embedding');
    expect(fsp.writeFile).toHaveBeenCalled();
  });

  it('should read legacy question/answer entries', async () => {
    const { readFile } = await import('node:fs/promises');
    const legacyQuestionAnswerBank = [
      { question: 'legacy question text', answer: 'legacy search term', embedding: [1, 0, 0] },
    ];
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(legacyQuestionAnswerBank));

    const transformers = await import('@huggingface/transformers');
    getPipelineMock(transformers).mockResolvedValue(
      vi.fn().mockResolvedValue({ data: new Float32Array([1, 0, 0]) }),
    );

    vi.resetModules();
    const { matchQueryBank } = await import('../../src/utils/embeddings');

    const result = await matchQueryBank('legacy question text');
    expect(result).toBe('legacy search term');
  });

  it('should fall back to legacy query-only entries when rebuild fails', async () => {
    const { readFile } = await import('node:fs/promises');
    const legacyBank = [
      { query: 'legacy iphone query', embedding: [1, 0, 0] },
    ];
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(legacyBank));

    const transformers = await import('@huggingface/transformers');
    getPipelineMock(transformers).mockRejectedValue(
      new Error('model unavailable'),
    );

    vi.resetModules();
    const { loadQueryBank } = await import('../../src/utils/embeddings');

    const bank = await loadQueryBank();
    expect(bank).toEqual([
      {
        intent: 'legacy iphone query',
        searchTerm: 'legacy iphone query',
        embedding: [1, 0, 0],
      },
    ]);
  });
});
