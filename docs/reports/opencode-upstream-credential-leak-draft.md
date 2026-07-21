# Upstream Issue Draft — OpenCode Resolved Configuration Exposes Environment Credentials

`DRAFT_ONLY_NOT_SUBMITTED`

## Affected version

- OpenCode: `1.15.13`
- Operating system: Linux `6.8.0-124-generic`, x86_64
- Shell: `/bin/bash`
- Reproduction date: `2026-07-20`

## Minimal reproduction

1. Create an isolated OpenCode configuration containing a supported
   environment placeholder such as `{env:ASSURANCE_API_KEY}` in a diagnostic
   configuration field.
2. Set that variable to a synthetic value only.
3. Run:

   ```text
   opencode debug config --print-logs --log-level DEBUG --pure
   ```

4. Capture stdout and stderr separately in an isolated `HOME`/XDG data root.

The same result was reproduced in two fresh processes. The project checkout
and the user's global OpenCode data were not used for the synthetic run.

## Expected behavior

Resolved configuration diagnostics should redact environment-derived credential
values before writing to stdout, stderr, logs, or any diagnostic artifact.

## Actual behavior

The native resolved-configuration serializer materializes the environment
value in stdout. In the isolated reproduction stdout contained the synthetic
sentinel in both fresh processes; stderr did not contain it. No real
credential was used or copied.

Sanitized observation:

```text
stdout: resolved configuration contains `Authorization: Bearer [synthetic-value]`
stderr: no matching synthetic value
exit: 0
```

## Security impact

An operator who runs the native diagnostic command can expose credentials in
terminal captures, CI logs, shell transcripts, support bundles, or downstream
log collectors. The issue is a credential confidentiality risk in the native
diagnostic serializer. This draft intentionally does not assign a CVSS score
or claim impact beyond the reproduced output channels.

## Potential output channels

- native `debug config` stdout;
- `--print-logs` stderr and application logs;
- terminal/session capture and any wrapper that persists raw command output;
- support or troubleshooting artifacts created from those outputs.

## Project-side mitigation

The OpenCode Agent Ecosystem does not invoke the native resolved-config
serializer in its supported Spec-Kit bridge, workflow, runtime adapter, or
managed launcher path. Those project-owned output and evidence boundaries now
use centralized redaction and fail-closed JSON handling. The project does not
claim global OpenCode credential safety and cannot repair the native serializer
from the project layer.

## Reproduction ownership

This was reproduced in the native OpenCode path, not in the Spec-Kit bridge.
The native command remains an explicitly unsafe upstream diagnostic path and
this document is not an issue submission.
