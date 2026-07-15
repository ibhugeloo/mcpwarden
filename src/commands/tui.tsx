/**
 * `tui` — interactive Ink dashboard.
 *
 * Read-first by design: browsing and switching the selected context is a live
 * PREVIEW; nothing is written until Enter saves the active profile. Pushing to
 * the client stays an explicit separate step (`mcpwarden apply`), so the TUI
 * can never mutate `~/.claude.json` on its own.
 *
 * Colour semantics follow DESIGN.md (CLI annex): green = OK/active, yellow =
 * warn (WRITE policy, preview), red = danger, gray = meta, bold = emphasis.
 */
import React, { useMemo, useState } from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import {
  loadRegistry,
  loadActiveProfile,
  saveActiveProfile,
  type LoadedRegistry,
} from "../core/registry.js";
import { listProfiles, serversInProfile } from "../core/profiles.js";
import { redactSecretRef } from "../core/audit.js";

const ALL = "all";

export function Dashboard({ reg }: { reg: LoadedRegistry }): React.JSX.Element {
  const { exit } = useApp();
  const profiles = useMemo(() => listProfiles(reg.servers), [reg]);
  const options = useMemo(() => [ALL, ...profiles], [profiles]);
  const [active, setActive] = useState<string | null>(() => loadActiveProfile(reg.dir));
  const [cursor, setCursor] = useState(() => {
    const idx = options.indexOf(active ?? ALL);
    return idx >= 0 ? idx : 0;
  });
  const [notice, setNotice] = useState<string | null>(null);

  const selectedOption = options[cursor] ?? ALL;
  const selected = selectedOption === ALL ? null : selectedOption;
  const previewing = selected !== active;

  const exposedNames = useMemo(
    () => new Set(serversInProfile(reg.servers, selected).map((s) => s.name)),
    [reg, selected],
  );
  const accounts = useMemo(() => new Map(reg.accounts.map((a) => [a.id, a])), [reg]);
  const shown = exposedNames.size;
  const hidden = reg.servers.length - shown;

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      exit();
      return;
    }
    if (key.leftArrow) {
      setCursor((c) => (c + options.length - 1) % options.length);
      setNotice(null);
      return;
    }
    if (key.rightArrow || key.tab) {
      setCursor((c) => (c + 1) % options.length);
      setNotice(null);
      return;
    }
    // Enter arrives as \r or \n depending on the terminal's line discipline.
    if (key.return || input === "\r" || input === "\n") {
      saveActiveProfile(reg.dir, selected);
      setActive(selected);
      setNotice("context saved — push it with: mcpwarden apply");
    }
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box>
        <Text bold>mcpwarden</Text>
        <Text color="gray"> — local MCP identity boundary</Text>
      </Box>
      <Text color="gray">registry: {reg.dir}</Text>

      <Box marginTop={1}>
        <Text color="gray">context  </Text>
        {options.map((opt) => {
          const isCursor = opt === selectedOption;
          const isActive = (opt === ALL ? null : opt) === active;
          return (
            <Text key={opt}>
              <Text
                color={isActive ? "green" : isCursor ? undefined : "gray"}
                bold={isCursor}
                inverse={isCursor}
              >
                {` ${opt} `}
              </Text>
              <Text> </Text>
            </Text>
          );
        })}
        {previewing ? <Text color="yellow">(preview — Enter to set)</Text> : null}
      </Box>
      <Text color="gray">
        {shown} exposed · {hidden} hidden
      </Text>

      <Box flexDirection="column" marginTop={1}>
        {reg.servers.map((server) => {
          const on = exposedNames.has(server.name);
          const account = accounts.get(server.account);
          const tags = server.profiles.length ? `[${server.profiles.join(", ")}]` : "[ubiquitous]";
          return (
            <Box key={server.name}>
              <Box width={2} flexShrink={0}>
                <Text color={on ? "green" : "gray"}>{on ? "●" : "○"}</Text>
              </Box>
              <Box width={24} flexShrink={0}>
                <Text bold={on} color={on ? undefined : "gray"} wrap="truncate-end">
                  {server.name}
                </Text>
              </Box>
              <Box width={14} flexShrink={0}>
                <Text color="gray" wrap="truncate-end">
                  {server.account}
                </Text>
              </Box>
              <Box width={10} flexShrink={0}>
                {server.policy.readOnly ? (
                  <Text color={on ? "green" : "gray"}>read-only</Text>
                ) : (
                  <Text color="yellow">WRITE</Text>
                )}
              </Box>
              <Box width={14} flexShrink={0}>
                <Text color="gray" wrap="truncate-end">
                  {tags}
                </Text>
              </Box>
              <Box flexGrow={1}>
                <Text color="gray" wrap="truncate-end">
                  {account ? redactSecretRef(account.secretRef) : ""}
                </Text>
              </Box>
            </Box>
          );
        })}
        {reg.servers.length === 0 ? <Text color="gray">(no servers in the registry)</Text> : null}
      </Box>

      <Box marginTop={1}>
        {notice ? (
          <Text color="green">✓ {notice}</Text>
        ) : (
          <Text color="gray">←/→ context · Enter set active · q quit</Text>
        )}
      </Box>
    </Box>
  );
}

export async function tuiCommand(opts: { registry?: string }): Promise<void> {
  if (!process.stdout.isTTY) {
    throw new Error("tui requires an interactive terminal (TTY). Use `mcpwarden list` instead.");
  }
  const reg = loadRegistry(opts.registry);
  const app = render(<Dashboard reg={reg} />);
  await app.waitUntilExit();
}
