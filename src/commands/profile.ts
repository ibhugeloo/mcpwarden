/** `profile` — manage the active context (the exclusive set of servers exposed). */
import chalk from "chalk";
import { loadRegistry, loadActiveProfile, saveActiveProfile } from "../core/registry.js";
import { listProfiles, serversInProfile, profileExists, ALL_PROFILE } from "../core/profiles.js";
import { applyCommand } from "./apply.js";

type Opts = { registry?: string };

export function profileListCommand(opts: Opts): void {
  const reg = loadRegistry(opts.registry);
  const active = loadActiveProfile(reg.dir);
  const profiles = listProfiles(reg.servers);
  const ubiquitous = reg.servers.filter((s) => s.profiles.length === 0).length;

  console.log();
  console.log(`  ${chalk.bold("profiles")} ${chalk.gray(`— active: ${active ?? "all (no profile)"}`)}`);
  console.log();
  if (!profiles.length) {
    console.log(`  ${chalk.gray("no profiles declared — every server is ubiquitous.")}`);
  }
  for (const p of profiles) {
    const n = serversInProfile(reg.servers, p).length;
    const mark = active === p ? chalk.green("●") : chalk.gray("○");
    const servers = reg.servers.filter((s) => s.profiles.includes(p)).map((s) => s.name);
    console.log(`  ${mark} ${chalk.bold(p)} ${chalk.gray(`(${n} server${n > 1 ? "s" : ""})`)}  ${chalk.gray(servers.join(", "))}`);
  }
  const allMark = active === null || active === ALL_PROFILE ? chalk.green("●") : chalk.gray("○");
  console.log(`  ${allMark} ${chalk.bold("all")} ${chalk.gray(`(${reg.servers.length} servers — no filtering)`)}`);
  if (ubiquitous) console.log(`\n  ${chalk.gray(`${ubiquitous} ubiquitous server(s) appear in every context.`)}`);
  console.log();
}

export async function profileUseCommand(
  name: string,
  opts: Opts & { apply?: boolean },
): Promise<void> {
  const reg = loadRegistry(opts.registry);
  const target = name.toLowerCase();

  if (target === "none" || target === "clear" || target === ALL_PROFILE) {
    saveActiveProfile(reg.dir, null);
    console.log(`\n  ${chalk.green("●")} context: ${chalk.bold("all")} ${chalk.gray("(no filtering — every server exposed)")}\n`);
  } else {
    if (!profileExists(reg.servers, target)) {
      const known = listProfiles(reg.servers);
      throw new Error(
        `Unknown profile "${name}". Known: ${known.length ? known.join(", ") : "(none)"}. ` +
          `Tag servers with it in servers.yaml, or use "all".`,
      );
    }
    saveActiveProfile(reg.dir, target);
    const servers = serversInProfile(reg.servers, target).map((s) => s.name);
    console.log(`\n  ${chalk.green("●")} context: ${chalk.bold(target)}`);
    console.log(`  ${chalk.gray(`exposes: ${servers.join(", ") || "(nothing)"}`)}\n`);
  }

  if (opts.apply) await applyCommand(opts);
}

export function profileShowCommand(name: string | undefined, opts: Opts): void {
  const reg = loadRegistry(opts.registry);
  const target = name ?? loadActiveProfile(reg.dir) ?? ALL_PROFILE;
  const servers = serversInProfile(reg.servers, target === ALL_PROFILE ? null : target);

  console.log();
  console.log(`  ${chalk.bold("context")} ${chalk.gray(target)}`);
  for (const s of servers) {
    const tags = s.profiles.length ? chalk.gray(`[${s.profiles.join(", ")}]`) : chalk.gray("[ubiquitous]");
    console.log(`  ${chalk.green("·")} ${s.name} ${tags}`);
  }
  if (!servers.length) console.log(`  ${chalk.gray("(no servers in this context)")}`);
  console.log();
}
