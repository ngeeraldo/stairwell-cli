#!/usr/bin/env node
import { Command } from "commander";
import {
  applyBatch,
  assertConfigExists,
  assertOpenclawInstalled,
  buildBatchCommand,
  OpenclawError,
  resolveConfigPath,
  runPostWriteCheck,
  type BatchEntry,
} from "./openclaw.js";
import {
  DEFAULT_MODEL,
  PROVIDER_ID,
  buildProvider,
} from "./providerSpec.js";
import { error, info, setVerbose, success } from "./log.js";

interface InitOpts {
  apiKey?: string;
  model?: string;
  dryRun?: boolean;
  verbose?: boolean;
}

const program = new Command();

program
  .name("stairwell")
  .description("Wire Stairwell into OpenClaw in one step.")
  .showHelpAfterError();

program
  .command("init")
  .description("Add Stairwell to OpenClaw and set it as the default model.")
  .option(
    "--api-key <key>",
    "Stairwell API key (get one from the dashboard)",
  )
  .option(
    "-m, --model <id>",
    "Default model to set (e.g. stairwell/<model-id>)",
    DEFAULT_MODEL,
  )
  .option(
    "--dry-run",
    "Print the exact openclaw command that would run without executing it",
    false,
  )
  .option("-v, --verbose", "Echo every openclaw subprocess invocation", false)
  .action((opts: InitOpts) => runInit(opts));

try {
  await program.parseAsync(process.argv);
} catch (err) {
  handleError(err);
}

function runInit(opts: InitOpts): void {
  setVerbose(!!opts.verbose);

  const apiKey = (opts.apiKey ?? "").trim();
  if (!apiKey) {
    error("--api-key is required and must not be empty");
    process.exit(2);
  }

  const model = (opts.model ?? DEFAULT_MODEL).trim();

  const provider = buildProvider(apiKey);
  const entries: BatchEntry[] = [
    { path: `models.providers.${PROVIDER_ID}`, value: provider },
    { path: "agents.defaults.model.primary", value: model },
  ];

  if (opts.dryRun) {
    const { pretty } = buildBatchCommand(entries);
    info("Dry run — the command that would execute:\n");
    process.stdout.write(`${pretty}\n`);
    return;
  }

  assertOpenclawInstalled();
  const configPath = resolveConfigPath();
  assertConfigExists(configPath);

  applyBatch(entries);
  runPostWriteCheck();

  success(`Stairwell added to ${configPath}`);
  success(`Provider  : models.providers.${PROVIDER_ID}`);
  success(`Default   : agents.defaults.model.primary = ${model}`);
}

function handleError(err: unknown): never {
  if (err instanceof OpenclawError) {
    error(err.message);
    process.exit(err.exitCode);
  }
  if (err instanceof Error) {
    error(err.message);
    process.exit(1);
  }
  error(String(err));
  process.exit(1);
}
