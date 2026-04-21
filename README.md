# stairwell

One-shot CLI that wires Stairwell into your existing [OpenClaw](https://docs.openclaw.ai) install.

## Usage

```bash
npx stairwell init --api-key sk-stairwell-...
```

That's it. The command adds a `stairwell` provider to `~/.openclaw/openclaw.json` and sets it as your default model.

### Requirements

- Node.js 18+
- OpenClaw already installed and initialized (`openclaw onboard`)

### Options

| Flag | Description |
|---|---|
| `--api-key <key>` | **Required.** Your Stairwell API key. |
| `--model <id>` | Default model to set (defaults to the Stairwell primary model). |
| `--dry-run` | Print the exact `openclaw config set --batch-json ...` command without executing it. |
| `--verbose` | Echo every openclaw subprocess invocation. |

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 2 | Missing/invalid `--api-key` |
| 3 | `openclaw` binary not found, or config missing (run `openclaw onboard`) |
| 4 | Write or post-write validation failed |

### What it does

The CLI issues a single atomic call to OpenClaw's own config CLI:

```bash
openclaw config set --strict-json --batch-json '[
  { "path": "models.providers.stairwell", "value": { ... } },
  { "path": "agents.defaults.model.primary", "value": "stairwell/..." }
]'
```

Leveraging `openclaw config set` directly means the tool stays in lockstep with upstream schema changes. The `--strict-json` flag runs Zod validation inline, and we run `openclaw config validate` (or `openclaw doctor` if unavailable) after the write as a belt-and-suspenders check.
