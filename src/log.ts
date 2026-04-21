import pc from "picocolors";

let verboseEnabled = false;

export function setVerbose(enabled: boolean) {
  verboseEnabled = enabled;
}

export function info(msg: string) {
  process.stderr.write(`${msg}\n`);
}

export function success(msg: string) {
  process.stderr.write(`${pc.green("✓")} ${msg}\n`);
}

export function warn(msg: string) {
  process.stderr.write(`${pc.yellow("!")} ${msg}\n`);
}

export function error(msg: string) {
  process.stderr.write(`${pc.red("✗")} ${msg}\n`);
}

export function verbose(msg: string) {
  if (verboseEnabled) process.stderr.write(`${pc.dim(`[verbose] ${msg}`)}\n`);
}

export function framedError(title: string, body: string) {
  const line = pc.red("─".repeat(Math.min(60, Math.max(title.length + 4, 20))));
  process.stderr.write(`${line}\n${pc.red(title)}\n${line}\n${body.trimEnd()}\n${line}\n`);
}
