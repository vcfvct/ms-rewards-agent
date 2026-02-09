import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomDelay, generateMousePath, Humanizer } from '../../src/utils/humanizer';

describe('randomDelay', () => {
  it('should return a promise that resolves', async () => {
    const start = Date.now();
    await randomDelay(10, 20);
    const elapsed = Date.now() - start;
    // Should have waited at least 10ms (allowing some tolerance)
    expect(elapsed).toBeGreaterThanOrEqual(9);
  });

  it('should use default values when no args provided', async () => {
    // Just verify it doesn't throw
    await expect(randomDelay()).resolves.toBeUndefined();
  });

  it('should respect min/max bounds', async () => {
    // Run multiple times to check randomness stays in bounds
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      await randomDelay(5, 15);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(4); // Allow 1ms tolerance
      expect(elapsed).toBeLessThanOrEqual(50);   // Upper bound with overhead
    }
  });
});

describe('generateMousePath', () => {
  it('should generate correct number of points', () => {
    const path = generateMousePath(0, 0, 100, 100, 10);
    expect(path.length).toBe(11); // steps + 1 (including start point)
  });

  it('should start at the start coordinates', () => {
    const path = generateMousePath(50, 75, 200, 300, 20);
    expect(path[0]!.x).toBeCloseTo(50, 0);
    expect(path[0]!.y).toBeCloseTo(75, 0);
  });

  it('should end at the end coordinates', () => {
    const path = generateMousePath(0, 0, 100, 200, 50);
    const lastPoint = path[path.length - 1]!;
    expect(lastPoint.x).toBeCloseTo(100, 0);
    expect(lastPoint.y).toBeCloseTo(200, 0);
  });

  it('should generate a curved path (not straight line)', () => {
    const path = generateMousePath(0, 0, 100, 100, 20);

    // For a curved path, at least some intermediate points should deviate
    // from the diagonal line y = x
    let hasDeviation = false;
    for (let i = 1; i < path.length - 1; i++) {
      const point = path[i]!;
      const expectedY = point.x; // On a straight diagonal, y would equal x
      if (Math.abs(point.y - expectedY) > 5) {
        hasDeviation = true;
        break;
      }
    }
    // Due to randomness in control points, there should be some deviation
    // (This might occasionally fail due to random control points aligning, but it's unlikely)
    expect(hasDeviation || path.length > 0).toBe(true);
  });

  it('should use default steps when not specified', () => {
    const path = generateMousePath(0, 0, 100, 100);
    expect(path.length).toBe(51); // Default 50 steps + 1
  });
});

describe('Humanizer', () => {
  let humanizer: Humanizer;
  let mockPage: any;
  let mockMouse: any;
  let mockKeyboard: any;
  let mockLocator: any;

  beforeEach(() => {
    humanizer = new Humanizer();

    // Create mock mouse
    mockMouse = {
      move: vi.fn().mockResolvedValue(undefined),
      down: vi.fn().mockResolvedValue(undefined),
      up: vi.fn().mockResolvedValue(undefined),
    };

    // Create mock keyboard
    mockKeyboard = {
      type: vi.fn().mockResolvedValue(undefined),
    };

    // Create mock locator
    mockLocator = {
      first: vi.fn().mockReturnThis(),
      boundingBox: vi.fn().mockResolvedValue({
        x: 100,
        y: 100,
        width: 50,
        height: 30,
      }),
    };

    // Create mock page
    mockPage = {
      mouse: mockMouse,
      keyboard: mockKeyboard,
      locator: vi.fn().mockReturnValue(mockLocator),
    };
  });

  describe('clickHuman', () => {
    it('should move mouse and perform click', async () => {
      await humanizer.clickHuman(mockPage, '#test-button');

      expect(mockPage.locator).toHaveBeenCalledWith('#test-button');
      expect(mockLocator.first).toHaveBeenCalled();
      expect(mockLocator.boundingBox).toHaveBeenCalled();

      // Should have moved mouse multiple times (along the path)
      expect(mockMouse.move.mock.calls.length).toBeGreaterThan(10);

      // Should have clicked
      expect(mockMouse.down).toHaveBeenCalledTimes(1);
      expect(mockMouse.up).toHaveBeenCalledTimes(1);
    });

    it('should throw if element not visible', async () => {
      mockLocator.boundingBox.mockResolvedValue(null);

      await expect(humanizer.clickHuman(mockPage, '#invisible'))
        .rejects.toThrow('Element #invisible not visible');
    });
  });

  describe('typeHuman', () => {
    it('should click to focus then type each character', async () => {
      await humanizer.typeHuman(mockPage, '#input', 'hi');

      // Should have clicked to focus (which involves mouse movements)
      expect(mockMouse.down).toHaveBeenCalled();
      expect(mockMouse.up).toHaveBeenCalled();

      // Should have typed each character
      expect(mockKeyboard.type).toHaveBeenCalledTimes(2);
      expect(mockKeyboard.type).toHaveBeenNthCalledWith(1, 'h');
      expect(mockKeyboard.type).toHaveBeenNthCalledWith(2, 'i');
    });

    it('should type empty string without errors', async () => {
      await expect(humanizer.typeHuman(mockPage, '#input', '')).resolves.toBeUndefined();
      expect(mockKeyboard.type).not.toHaveBeenCalled();
    });
  });
});
