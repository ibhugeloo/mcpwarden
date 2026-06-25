/**
 * Profiles = exclusive contexts. A profile selects which servers Claude Code
 * sees. The active profile is the heart of mcpwarden's wedge: switch context and
 * the client only ever sees that context's servers — never the whole fleet.
 *
 * Rule:
 *  - active profile X  → a server is included if it is tagged with X, OR it has
 *    no tags at all (untagged = ubiquitous / always-on).
 *  - active profile null or "all" → every server is included (no filtering).
 */
import type { McpServer } from "./types.js";

export const ALL_PROFILE = "all";

export function serversInProfile(servers: McpServer[], profile: string | null): McpServer[] {
  if (!profile || profile === ALL_PROFILE) return servers;
  return servers.filter((s) => s.profiles.length === 0 || s.profiles.includes(profile));
}

/** All distinct profile names declared across the registry, sorted. */
export function listProfiles(servers: McpServer[]): string[] {
  const set = new Set<string>();
  for (const s of servers) for (const p of s.profiles) set.add(p);
  return [...set].sort();
}

/** True when the profile name exists in the registry (or is the reserved "all"). */
export function profileExists(servers: McpServer[], profile: string): boolean {
  return profile === ALL_PROFILE || listProfiles(servers).includes(profile);
}
