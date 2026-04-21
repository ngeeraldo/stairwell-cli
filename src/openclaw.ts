import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { framedError, verbose } from "./log.js";

export class OpenclawError extends Error {
  constructor(
    message: string,
    public exitCode: number,
    public stderr: string = "",
  ) {
    super(message);
    this.name = "OpenclawError";
  }
}

export interface RunOptions {
  capture?: boolean;
  allowFailure?: boolean;
}

export interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

const UNKNOWN_SUBCOMMAND_PATTERNS = [
  /unknown command/i,
  /unknown subcommand/i,
  /unrecognized (?:command|subcommand|argument)/i,
  /no such command/i,
  /command not found/i,
];

function looksLikeUnknownSubcommand(status: number, stderr: string): boolean {
  if (status === 127) return true;
  return UNKNOWN_SUBCOMMAND_PATTERNS.some((re) => re.test(stderr));
}

export function runOpenclaw(args: string[], opts: RunOptions = {}): RunResult {
  const capture = opts.capture ?? true;
  verbose(`openclaw ${args.map(quoteForDisplay).join(" ")}`);
  const result = spawnSync("openclaw", args, {
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
  });

  if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new OpenclawError("openclaw binary not found on PATH", 3);
  }
  if (result.error) {
    throw new OpenclawError(
      `failed to invoke openclaw: ${result.error.message}`,
      1,
    );
  }

  const status = result.status ?? 1;
  const stdout = (result.stdout ?? "").toString();
  const stderr = (result.stderr ?? "").toString();

  if (status !== 0 && !opts.allowFailure) {
    throw new OpenclawError(
      `openclaw ${args[0] ?? ""} failed (exit ${status})`,
      4,
      stderr,
    );
  }

  return { status, stdout, stderr };
}

export function quoteForDisplay(arg: string): string {
  if (/^[A-Za-z0-9_@:./=+-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

export function assertOpenclawInstalled(): void {
  const probe = spawnSync("openclaw", ["--version"], { encoding: "utf8" });
  if (probe.error && (probe.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new OpenclawError(
      "openclaw binary not found on PATH. Install OpenClaw and re-run.",
      3,
    );
  }
  verbose(`openclaw --version exit=${probe.status ?? "unknown"}`);
}

export function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function resolveConfigPath(): string {
  try {
    const { stdout } = runOpenclaw(["config", "file"], { capture: true });
    const trimmed = stdout.trim();
    if (trimmed) return expandHome(trimmed);
  } catch (err) {
    verbose(
      `openclaw config file failed; falling back to ~/.openclaw/openclaw.json (${
        (err as Error).message
      })`,
    );
  }
  if (process.env.OPENCLAW_CONFIG_PATH) {
    return expandHome(process.env.OPENCLAW_CONFIG_PATH);
  }
  const stateDir = process.env.OPENCLAW_STATE_DIR
    ? expandHome(process.env.OPENCLAW_STATE_DIR)
    : path.join(os.homedir(), ".openclaw");
  return path.join(stateDir, "openclaw.json");
}

export function assertConfigExists(configPath: string): void {
  if (!fs.existsSync(configPath)) {
    throw new OpenclawError(
      `OpenClaw is not initialized (config not found at ${configPath}). Run \`openclaw onboard\` first, then re-run this command.`,
      3,
    );
  }
}

export interface BatchEntry {
  path: string;
  value: unknown;
}

export function buildBatchCommand(entries: BatchEntry[]): {
  bin: string;
  args: string[];
  pretty: string;
} {
  const payload = JSON.stringify(entries);
  const args = ["config", "set", "--strict-json", "--batch-json", payload];
  const pretty = [
    "openclaw",
    "config",
    "set",
    "--strict-json",
    "--batch-json",
    `'${JSON.stringify(entries, null, 2)}'`,
  ].join(" ");
  return { bin: "openclaw", args, pretty };
}

export function applyBatch(entries: BatchEntry[]): void {
  const { args } = buildBatchCommand(entries);
  const { status, stderr } = runOpenclaw(args, {
    capture: true,
    allowFailure: true,
  });
  if (status !== 0) {
    framedError("openclaw rejected the configuration", stderr || "(no stderr)");
    throw new OpenclawError(
      `openclaw config set exited ${status}`,
      4,
      stderr,
    );
  }
}

export function runPostWriteCheck(): void {
  const validate = runOpenclaw(["config", "validate"], {
    capture: true,
    allowFailure: true,
  });

  if (validate.status === 0) return;

  if (looksLikeUnknownSubcommand(validate.status, validate.stderr)) {
    verbose(
      "`openclaw config validate` not available; falling back to `openclaw doctor`",
    );
    const doctor = runOpenclaw(["doctor"], {
      capture: true,
      allowFailure: true,
    });
    if (doctor.status === 0) return;
    framedError(
      "openclaw doctor reported problems",
      doctor.stderr || doctor.stdout || "(no output)",
    );
    throw new OpenclawError(
      `openclaw doctor exited ${doctor.status}`,
      4,
      doctor.stderr,
    );
  }

  framedError(
    "openclaw config validate failed",
    validate.stderr || validate.stdout || "(no output)",
  );
  throw new OpenclawError(
    `openclaw config validate exited ${validate.status}`,
    4,
    validate.stderr,
  );
}

export function readDefaultModel(): string | undefined {
  const { status, stdout } = runOpenclaw(
    ["config", "get", "agents.defaults.model.primary"],
    { capture: true, allowFailure: true },
  );
  if (status !== 0) return undefined;
  return stdout.trim().replace(/^"|"$/g, "") || undefined;
}
