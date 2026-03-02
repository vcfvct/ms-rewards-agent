import { readFileSync, existsSync, mkdirSync, cpSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

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
  if (process.platform === "win32") {
    return join(
      process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"),
      "Microsoft",
      "Edge",
      "User Data",
    );
  } else if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "Microsoft Edge");
  } else {
    return join(homedir(), ".config", "microsoft-edge");
  }
}

/**
 * Scans Edge's Local State file and returns all user profiles.
 */
export function scanEdgeProfiles(): EdgeProfile[] {
  const userDataDir = getEdgeUserDataDir();
  const localStatePath = join(userDataDir, "Local State");

  if (!existsSync(localStatePath)) {
    console.error(
      `[edge-profiles] Local State file not found at: ${localStatePath}`,
    );
    return [];
  }

  try {
    const raw = readFileSync(localStatePath, "utf-8");
    const localState = JSON.parse(raw);
    const infoCache = localState?.profile?.info_cache;

    if (!infoCache || typeof infoCache !== "object") {
      console.error(
        "[edge-profiles] No profile info_cache found in Local State",
      );
      return [];
    }

    const profiles: EdgeProfile[] = [];

    for (const [folderName, meta] of Object.entries(infoCache)) {
      const m = meta as Record<string, unknown>;
      profiles.push({
        folderName,
        displayName: String(m.name ?? ""),
        email: String(m.user_name ?? ""),
        gaiaName: String(m.gaia_name ?? ""),
      });
    }

    return profiles.sort((a, b) => a.folderName.localeCompare(b.folderName));
  } catch (error) {
    console.error("[edge-profiles] Failed to read Local State:", error);
    return [];
  }
}

/**
 * Resolves a profile by matching the given name against displayName, email, or gaiaName (case-insensitive).
 */
export function resolveProfileByName(
  name: string,
): { userDataDir: string; profileDir: string } | null {
  const profiles = scanEdgeProfiles();
  const lower = name.toLowerCase();

  const match = profiles.find(
    (p) =>
      p.displayName.toLowerCase() === lower ||
      p.email.toLowerCase() === lower ||
      p.gaiaName.toLowerCase() === lower ||
      p.folderName.toLowerCase() === lower,
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

  console.log("\nAvailable Edge profiles:\n");

  // Calculate column widths
  const headers = {
    num: "#",
    folder: "Folder",
    display: "Display Name",
    email: "Email",
    gaia: "Account Name",
  };
  const widths = {
    num: 3,
    folder: Math.max(
      headers.folder.length,
      ...profiles.map((p) => p.folderName.length),
    ),
    display: Math.max(
      headers.display.length,
      ...profiles.map((p) => p.displayName.length),
    ),
    email: Math.max(
      headers.email.length,
      ...profiles.map((p) => p.email.length),
    ),
    gaia: Math.max(
      headers.gaia.length,
      ...profiles.map((p) => p.gaiaName.length),
    ),
  };

  const pad = (s: string, w: number) => s.padEnd(w);

  // Header
  console.log(
    `  ${pad(headers.num, widths.num)}  ${pad(headers.folder, widths.folder)}  ${pad(headers.display, widths.display)}  ${pad(headers.email, widths.email)}  ${pad(headers.gaia, widths.gaia)}`,
  );
  console.log(
    `  ${"-".repeat(widths.num)}  ${"-".repeat(widths.folder)}  ${"-".repeat(widths.display)}  ${"-".repeat(widths.email)}  ${"-".repeat(widths.gaia)}`,
  );

  // Rows
  profiles.forEach((p, i) => {
    console.log(
      `  ${pad(String(i + 1), widths.num)}  ${pad(p.folderName, widths.folder)}  ${pad(p.displayName, widths.display)}  ${pad(p.email, widths.email)}  ${pad(p.gaiaName, widths.gaia)}`,
    );
  });

  console.log(`\nUsage: pnpm run start -- --profile "<display name or email>"`);
}

/**
 * Returns the isolated agent user data directory (not the real Edge one).
 * Each profile gets its own isolated copy to avoid locking conflicts.
 */
export function getAgentProfileDir(profileFolderName: string): string {
  const home = homedir();
  if (process.platform === "win32") {
    return join(home, ".ms-rewards-agent", "profiles", profileFolderName);
  } else if (process.platform === "darwin") {
    return join(
      home,
      "Library",
      "Application Support",
      "ms-rewards-agent",
      "profiles",
      profileFolderName,
    );
  } else {
    return join(home, ".ms-rewards-agent", "profiles", profileFolderName);
  }
}

/**
 * Checks if Microsoft Edge is currently running.
 */
export function isEdgeRunning(): boolean {
  try {
    if (process.platform === "win32") {
      const result = execSync('tasklist /FI "IMAGENAME eq msedge.exe" /NH', {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return result.toLowerCase().includes("msedge.exe");
    } else if (process.platform === "darwin") {
      const result = execSync('pgrep -x "Microsoft Edge"', {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return result.trim().length > 0;
    } else {
      const result = execSync("pgrep -x microsoft-edge", {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return result.trim().length > 0;
    }
  } catch {
    // pgrep exits with code 1 if no process found
    return false;
  }
}

/**
 * Copies essential profile data from Edge's live directory into an isolated agent directory.
 * This avoids lock conflicts when Edge is running.
 *
 * Copies:
 * - The profile subfolder (cookies, login data, preferences, etc.)
 * - The Local State file (required by Chromium to recognize profiles)
 *
 * Returns the isolated userDataDir path to use with Playwright.
 */
export function copyProfileToIsolated(profileFolderName: string): string {
  const edgeUserDataDir = getEdgeUserDataDir();
  const isolatedBaseDir = getAgentProfileDir(profileFolderName);

  // Create isolated base directory
  mkdirSync(isolatedBaseDir, { recursive: true });

  // Copy Local State file (required for Chromium to recognize profiles)
  const localStateSrc = join(edgeUserDataDir, "Local State");
  const localStateDst = join(isolatedBaseDir, "Local State");
  if (existsSync(localStateSrc)) {
    cpSync(localStateSrc, localStateDst, { force: true });
  }

  // Copy the profile folder
  const profileSrc = join(edgeUserDataDir, profileFolderName);
  const profileDst = join(isolatedBaseDir, profileFolderName);

  if (!existsSync(profileSrc)) {
    throw new Error(`Edge profile folder not found: ${profileSrc}`);
  }

  // Copy profile directory contents (skip lock files and cache to save space/time)
  const skipPatterns = [
    "Cache",
    "Code Cache",
    "GPUCache",
    "Service Worker",
    "lockfile",
    "LOCK",
    "LOG",
    "LOG.old",
  ];

  mkdirSync(profileDst, { recursive: true });

  const entries = readdirSync(profileSrc, { withFileTypes: true });
  for (const entry of entries) {
    if (
      skipPatterns.some(
        (pattern) => entry.name === pattern || entry.name.startsWith(pattern),
      )
    ) {
      continue;
    }
    const src = join(profileSrc, entry.name);
    const dst = join(profileDst, entry.name);
    try {
      cpSync(src, dst, { recursive: true, force: true });
    } catch {
      // Some files may be locked by Edge; skip them silently
    }
  }

  console.log(`Profile data copied to isolated directory: ${isolatedBaseDir}`);
  return isolatedBaseDir;
}
