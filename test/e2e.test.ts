import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { expandHome } from "../src/openclaw.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CLI_PATH = path.join(REPO_ROOT, "dist", "src", "cli.js");
const FIXTURE_SRC = path.join(REPO_ROOT, "test", "fixtures", "openclaw.json");

let openclawAvailable = false;

function isOpenclawOnPath(): boolean {
  const result = spawnSync("which", ["openclaw"], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim().length > 0;
}

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], env: NodeJS.ProcessEnv = {}): RunResult {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function withIsolatedOpenclaw<T>(
  fn: (stateDir: string, configPath: string) => T,
): T {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "stairwell-test-"));
  const configPath = path.join(stateDir, "openclaw.json");
  fs.copyFileSync(FIXTURE_SRC, configPath);
  const originalStateDir = process.env.OPENCLAW_STATE_DIR;
  process.env.OPENCLAW_STATE_DIR = stateDir;
  try {
    return fn(stateDir, configPath);
  } finally {
    if (originalStateDir === undefined) delete process.env.OPENCLAW_STATE_DIR;
    else process.env.OPENCLAW_STATE_DIR = originalStateDir;
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
}

function openclawGet(key: string): RunResult {
  const result = spawnSync("openclaw", ["config", "get", key], {
    encoding: "utf8",
    env: process.env,
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

before(() => {
  openclawAvailable = isOpenclawOnPath();
});

describe("expandHome", () => {
  it("expands a bare tilde to the user home dir", () => {
    assert.equal(expandHome("~"), os.homedir());
  });

  it("expands ~/foo to <home>/foo", () => {
    assert.equal(expandHome("~/foo/bar"), path.join(os.homedir(), "foo/bar"));
  });

  it("leaves absolute paths untouched", () => {
    assert.equal(expandHome("/tmp/x"), "/tmp/x");
  });

  it("leaves relative paths with mid-string tilde untouched", () => {
    assert.equal(expandHome("./~weird"), "./~weird");
  });
});

describe("stairwell init (e2e)", () => {
  it("happy path writes provider and default model", (t) => {
    if (!openclawAvailable) {
      t.skip("OpenClaw not found on PATH; install it to run e2e tests.");
      return;
    }
    withIsolatedOpenclaw((_stateDir, configPath) => {
      const r = runCli(["init", "--api-key", "test-key"]);
      assert.equal(
        r.status,
        0,
        `expected success, got exit ${r.status}\nstderr:\n${r.stderr}`,
      );
      // openclaw config get redacts secrets in its output; read the raw file
      // to confirm the actual apiKey was persisted.
      const onDisk = JSON.parse(fs.readFileSync(configPath, "utf8"));
      assert.equal(onDisk.models.providers.stairwell.apiKey, "test-key");
      assert.equal(
        onDisk.models.providers.stairwell.baseUrl,
        "https://api.stairwell.run/v1",
      );
      const defaultRead = openclawGet("agents.defaults.model.primary");
      assert.equal(defaultRead.status, 0);
      assert.match(defaultRead.stdout, /stairwell\//);
    });
  });

  it("is idempotent across repeated runs", (t) => {
    if (!openclawAvailable) {
      t.skip("OpenClaw not found on PATH; install it to run e2e tests.");
      return;
    }
    withIsolatedOpenclaw((_stateDir, configPath) => {
      const first = runCli(["init", "--api-key", "test-key"]);
      assert.equal(first.status, 0, first.stderr);
      const afterFirst = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const second = runCli(["init", "--api-key", "test-key"]);
      assert.equal(second.status, 0, second.stderr);
      const afterSecond = JSON.parse(fs.readFileSync(configPath, "utf8"));
      // openclaw bumps meta.lastTouchedAt on every write; compare only the
      // subtrees our CLI controls.
      assert.deepEqual(
        afterSecond.models,
        afterFirst.models,
        "models subtree changed between runs",
      );
      assert.deepEqual(
        afterSecond.agents.defaults.model,
        afterFirst.agents.defaults.model,
        "default model changed between runs",
      );
    });
  });

  it("exits 2 when --api-key is missing", (t) => {
    if (!openclawAvailable) {
      t.skip("OpenClaw not found on PATH; install it to run e2e tests.");
      return;
    }
    withIsolatedOpenclaw(() => {
      const r = runCli(["init"]);
      assert.equal(r.status, 2);
      assert.match(r.stderr, /api-key/i);
    });
  });

  it("dry-run does not modify the config file", (t) => {
    if (!openclawAvailable) {
      t.skip("OpenClaw not found on PATH; install it to run e2e tests.");
      return;
    }
    withIsolatedOpenclaw((_stateDir, configPath) => {
      const before = fs.statSync(configPath).mtimeMs;
      const r = runCli(["init", "--api-key", "test-key", "--dry-run"]);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /openclaw config set --strict-json --batch-json/);
      const after = fs.statSync(configPath).mtimeMs;
      assert.equal(after, before, "config mtime should be unchanged");
    });
  });

  it("exits 3 when config is not initialized", (t) => {
    if (!openclawAvailable) {
      t.skip("OpenClaw not found on PATH; install it to run e2e tests.");
      return;
    }
    withIsolatedOpenclaw((_stateDir, configPath) => {
      fs.unlinkSync(configPath);
      const r = runCli(["init", "--api-key", "test-key"]);
      assert.equal(r.status, 3);
      assert.match(r.stderr, /openclaw onboard/);
    });
  });

  it("exits 4 with validator output when the provider spec is invalid", (t) => {
    if (!openclawAvailable) {
      t.skip("OpenClaw not found on PATH; install it to run e2e tests.");
      return;
    }
    withIsolatedOpenclaw(() => {
      // Inject an invalid spec via a test-only env override the CLI
      // honors when STAIRWELL_TEST_PROVIDER_OVERRIDE is set.
      const bad = JSON.stringify({
        baseUrl: 123, // non-string, should fail Zod
        api: "openai-completions",
        apiKey: "__INJECTED__",
        models: [],
      });
      const r = runCli(["init", "--api-key", "test-key"], {
        STAIRWELL_TEST_PROVIDER_OVERRIDE: bad,
      });
      assert.equal(r.status, 4, `expected exit 4, got ${r.status}`);
    });
  });
});
