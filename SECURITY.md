# Security policy

## Reporting a vulnerability

Report vulnerabilities privately through GitHub security advisories: https://github.com/Sasisundar2211/VouqisVerify/security/advisories/new. Do not open a public issue. Expect an acknowledgement within 7 days.

## Supported versions

Only the latest release receives security fixes.

## Trust model

- A suite file names a Python callable, and `vouqis run` imports and executes it. Treat suite files like test code: run only suites you trust. `vouqis validate` also imports the target.
- Suites load with `yaml.safe_load`, so YAML tags cannot construct Python objects.
- Vouqis Verify reads no environment variables for credentials and makes no network calls. Your target code makes whatever calls it makes.
- Run files and baselines contain your workflow's inputs, outputs, retrieved text, and tool arguments. Review them before committing or uploading. Keep secrets out of target outputs.
- The GitHub Action passes inputs to the shell through environment variables with glob expansion disabled. It requests no permissions and never writes to the repository.
