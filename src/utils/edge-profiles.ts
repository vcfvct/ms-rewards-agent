import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface EdgeProfile {
  folderName: string;
  displayName: string;
  email: string;
  gaiaName: string;
}

/**
 * Returns the system Edge User Data directory (where real Edge profiles live).
 * This is NOT the isolated agent profile — it's Edge's actual installation data.
 */
export function getEdgeUserDataDir(): string {
  if (process.platform === 'win32') {
    return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Microsoft', 'Edge', 'User Data');
  } else if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Microsoft Edge');
  } else {
    return join(homedir(), '.config', 'microsoft-edge');
  }
}

/**
 * Scans Edge's Local State file and returns all user profiles.
 */
export function scanEdgeProfiles(): EdgeProfile[] {
  const userDataDir = getEdgeUserDataDir();
  const localStatePath = join(userDataDir, 'Local State');

  if (!existsSync(localStatePath)) {
    console.error(`[edge-profiles] Local State file not found at: ${localStatePath}`);
    return [];
  }

  try {
    const raw = readFileSync(localStatePath, 'utf-8');
    const localState = JSON.parse(raw);
    const infoCache = localState?.profile?.info_cache;

    if (!infoCache || typeof infoCache !== 'object') {
      console.error('[edge-profiles] No profile info_cache found in Local State');
      return [];
    }

    const profiles: EdgeProfile[] = [];

    for (const [folderName, meta] of Object.entries(infoCache)) {
      const m = meta as Record<string, unknown>;
      profiles.push({
        folderName,
        displayName: String(m.name ?? ''),
        email: String(m.user_name ?? ''),
        gaiaName: String(m.gaia_name ?? ''),
      });
    }

    return profiles.sort((a, b) => a.folderName.localeCompare(b.folderName));
  } catch (error) {
    console.error('[edge-profiles] Failed to read Local State:', error);
    return [];
  }
}

/**
 * Resolves a profile by matching the given name against displayName, email, or gaiaName (case-insensitive).
 */
export function resolveProfileByName(name: string): { userDataDir: string; profileDir: string } | null {
  const profiles = scanEdgeProfiles();
  const lower = name.toLowerCase();

  const match = profiles.find(p =>
    p.displayName.toLowerCase() === lower ||
    p.email.toLowerCase() === lower ||
    p.gaiaName.toLowerCase() === lower ||
    p.folderName.toLowerCase() === lower
  );

  if (!match) return null;

  return {
    userDataDir: getEdgeUserDataDir(),
    profileDir: match.folderName,
  };
}

/**
 * Prints available Edge profiles in a formatted table.
 */
export function printProfiles(): void {
  const profiles = scanEdgeProfiles();

  if (profiles.length === 0) {
    console.log(`No Edge profiles found at: ${getEdgeUserDataDir()}`);
    return;
  }

  console.log('\nAvailable Edge profiles:\n');

  // Calculate column widths
  const headers = { num: '#', folder: 'Folder', display: 'Display Name', email: 'Email', gaia: 'Account Name' };
  const widths = {
    num: 3,
    folder: Math.max(headers.folder.length, ...profiles.map(p => p.folderName.length)),
    display: Math.max(headers.display.length, ...profiles.map(p => p.displayName.length)),
    email: Math.max(headers.email.length, ...profiles.map(p => p.email.length)),
    gaia: Math.max(headers.gaia.length, ...profiles.map(p => p.gaiaName.length)),
  };

  const pad = (s: string, w: number) => s.padEnd(w);

  // Header
  console.log(`  ${pad(headers.num, widths.num)}  ${pad(headers.folder, widths.folder)}  ${pad(headers.display, widths.display)}  ${pad(headers.email, widths.email)}  ${pad(headers.gaia, widths.gaia)}`);
  console.log(`  ${'-'.repeat(widths.num)}  ${'-'.repeat(widths.folder)}  ${'-'.repeat(widths.display)}  ${'-'.repeat(widths.email)}  ${'-'.repeat(widths.gaia)}`);

  // Rows
  profiles.forEach((p, i) => {
    console.log(`  ${pad(String(i + 1), widths.num)}  ${pad(p.folderName, widths.folder)}  ${pad(p.displayName, widths.display)}  ${pad(p.email, widths.email)}  ${pad(p.gaiaName, widths.gaia)}`);
  });

  console.log(`\nUsage: pnpm run start -- --profile "<display name or email>"`);
}
