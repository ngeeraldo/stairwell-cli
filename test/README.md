# Tests

End-to-end tests drive the real `openclaw` binary against an isolated state directory (`OPENCLAW_STATE_DIR` points at a per-test temp directory).

## Fixture

[fixtures/openclaw.json](fixtures/openclaw.json) is generated from a fresh non-interactive `openclaw onboard` run. Regenerate it whenever OpenClaw's config schema changes:

```bash
SANDBOX=$(mktemp -d)
OPENCLAW_STATE_DIR="$SANDBOX" openclaw onboard \
  --non-interactive --accept-risk \
  --skip-daemon --skip-channels --skip-health \
  --skip-search --skip-skills --skip-ui
cp "$SANDBOX/openclaw.json" test/fixtures/openclaw.json
rm -rf "$SANDBOX"
```

Do not hand-author this file — OpenClaw's schema evolves and the validator will catch drift. The fixture contains a randomly generated `gateway.auth.token`; that's expected and harmless for test isolation.

## Running

```bash
npm run build
npm test
```

If `openclaw` is not on PATH the tests **skip** with a clear message. They do not fail.
