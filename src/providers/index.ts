/** Provider adapter registry. Add a provider here and the whole CLI picks it up. */
import type { ProviderAdapter } from "../core/types.js";
import { supabaseAdapter } from "./supabase.js";

const adapters = new Map<string, ProviderAdapter>([[supabaseAdapter.id, supabaseAdapter]]);

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
