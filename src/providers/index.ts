/** Provider adapter registry. Add a provider here and the whole CLI picks it up. */
import type { ProviderAdapter } from "../core/types.js";
import { supabaseAdapter } from "./supabase.js";
import { githubAdapter } from "./github.js";
import { sentryAdapter } from "./sentry.js";
import { notionAdapter } from "./notion.js";

const adapters = new Map<string, ProviderAdapter>(
  [supabaseAdapter, githubAdapter, sentryAdapter, notionAdapter].map((adapter) => [
    adapter.id,
    adapter,
  ]),
);

export function getAdapter(providerId: string): ProviderAdapter | undefined {
  return adapters.get(providerId);
}

export function requireAdapter(providerId: string): ProviderAdapter {
  const a = adapters.get(providerId);
  if (!a) {
    throw new Error(
      `No adapter for provider "${providerId}". Known: ${[...adapters.keys()].join(", ")}.`,
    );
  }
  return a;
}

export function knownProviders(): string[] {
  return [...adapters.keys()];
}
