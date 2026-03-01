import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scanEdgeProfiles, resolveProfileByName, printProfiles, getEdgeUserDataDir } from '../../src/utils/edge-profiles';
import * as fs from 'fs';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

const MOCK_LOCAL_STATE = {
  profile: {
    info_cache: {
      Default: {
        name: 'Personal',
        user_name: 'user@outlook.com',
        gaia_name: 'John Doe',
      },
      'Profile 1': {
        name: 'Work',
        user_name: 'user@company.com',
        gaia_name: 'John Doe',
      },
      'Profile 2': {
        name: 'Testing',
        user_name: '',
        gaia_name: '',
      },
    },
  },
};

describe('edge-profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getEdgeUserDataDir', () => {
    it('should return a non-empty string', () => {
      const dir = getEdgeUserDataDir();
      expect(dir).toBeTruthy();
      expect(typeof dir).toBe('string');
    });
  });

  describe('scanEdgeProfiles', () => {
    it('should parse profiles from valid Local State', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(MOCK_LOCAL_STATE));

      const profiles = scanEdgeProfiles();

      expect(profiles).toHaveLength(3);
      expect(profiles[0]).toEqual({
        folderName: 'Default',
        displayName: 'Personal',
        email: 'user@outlook.com',
        gaiaName: 'John Doe',
      });
      expect(profiles[1]).toEqual({
        folderName: 'Profile 1',
        displayName: 'Work',
        email: 'user@company.com',
        gaiaName: 'John Doe',
      });
    });

    it('should return sorted by folder name', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(MOCK_LOCAL_STATE));

      const profiles = scanEdgeProfiles();
      const folderNames = profiles.map(p => p.folderName);

      expect(folderNames).toEqual(['Default', 'Profile 1', 'Profile 2']);
    });

    it('should return empty array when Local State file is missing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const profiles = scanEdgeProfiles();

      expect(profiles).toEqual([]);
    });

    it('should return empty array on malformed JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('not json');

      const profiles = scanEdgeProfiles();

      expect(profiles).toEqual([]);
    });

    it('should return empty array when info_cache is missing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ profile: {} }));

      const profiles = scanEdgeProfiles();

      expect(profiles).toEqual([]);
    });

    it('should handle missing fields gracefully', () => {
      const sparse = {
        profile: {
          info_cache: {
            Default: { name: 'Test' },
          },
        },
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(sparse));

      const profiles = scanEdgeProfiles();

      expect(profiles).toHaveLength(1);
      expect(profiles[0]!.email).toBe('');
      expect(profiles[0]!.gaiaName).toBe('');
    });
  });

  describe('resolveProfileByName', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(MOCK_LOCAL_STATE));
    });

    it('should match by display name', () => {
      const result = resolveProfileByName('Work');

      expect(result).not.toBeNull();
      expect(result!.profileDir).toBe('Profile 1');
    });

    it('should match by email', () => {
      const result = resolveProfileByName('user@company.com');

      expect(result).not.toBeNull();
      expect(result!.profileDir).toBe('Profile 1');
    });

    it('should match by gaia name', () => {
      const result = resolveProfileByName('John Doe');

      expect(result).not.toBeNull();
      // First match (Default) since both profiles have same gaiaName
      expect(result!.profileDir).toBe('Default');
    });

    it('should match by folder name', () => {
      const result = resolveProfileByName('Profile 2');

      expect(result).not.toBeNull();
      expect(result!.profileDir).toBe('Profile 2');
    });

    it('should be case-insensitive', () => {
      const result = resolveProfileByName('WORK');

      expect(result).not.toBeNull();
      expect(result!.profileDir).toBe('Profile 1');
    });

    it('should return null for no match', () => {
      const result = resolveProfileByName('Nonexistent');

      expect(result).toBeNull();
    });

    it('should include userDataDir in result', () => {
      const result = resolveProfileByName('Personal');

      expect(result).not.toBeNull();
      expect(result!.userDataDir).toBeTruthy();
      expect(typeof result!.userDataDir).toBe('string');
    });
  });

  describe('printProfiles', () => {
    it('should print formatted table when profiles exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(MOCK_LOCAL_STATE));
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      printProfiles();

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Available Edge profiles');
      expect(output).toContain('Default');
      expect(output).toContain('Profile 1');
      expect(output).toContain('Personal');
      expect(output).toContain('Work');

      consoleSpy.mockRestore();
    });

    it('should print message when no profiles found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      printProfiles();

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('No Edge profiles found');

      consoleSpy.mockRestore();
    });
  });
});
