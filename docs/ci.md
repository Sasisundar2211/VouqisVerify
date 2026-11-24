# CI integration

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | All cases passed and no comparison errors (and no warnings with `--fail-on-warnings`). |
| 1 | A case failed or the baseline comparison found an error. |
| 2 | Usage or configuration error: bad suite, missing baseline, import failure, bad arguments. |

## GitHub Action

`action.yml` at the repository root is a composite action. It sets up Python, installs Vouqis Verify and your dependencies, runs `vouqis run`, and appends the Markdown report to the job summary.

```yaml
name: Verify AI workflow
on: [pull_request]
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Sasisundar2211/VouqisVerify@main
        with:
          suite: vouqis.yaml
          baseline: vouqis-baseline.json
          install: -r requirements.txt
          args: --junit vouqis-junit.xml
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

Pin the action to a tag or commit SHA once releases exist, rather than `@main`.

| Input | Default | Meaning |
| --- | --- | --- |
| `suite` | required | Suite file path. |
| `baseline` | empty | Baseline JSON. Empty runs checks with no comparison. |
| `args` | empty | Extra `vouqis run` flags, split on whitespace. |
| `install` | empty | Extra `pip install` arguments for your workflow. |
| `package` | empty | pip requirement for Vouqis Verify. Empty installs from the action's own source. |
| `python-version` | `3.12` | Python to set up. |
| `working-directory` | `.` | Directory to run in. |

Output `exit-code` holds 0, 1, or 2.

Inputs reach the shell through environment variables and glob expansion is off, so a crafted input value becomes a literal argument, not a command.

The action never writes to the repository, posts comments, or reads secrets on its own. Secrets reach your workflow only through the `env:` you pass.

## Baseline strategies

**Committed baseline.** Generate on the main branch and commit it:

```sh
vouqis run vouqis.yaml --save-baseline vouqis-baseline.json
git add vouqis-baseline.json
```

Pull requests compare against it. Refresh it in the same pull request that intentionally changes behavior, so reviewers see the baseline diff next to the code diff.

**Baseline from the base branch.** Run the suite twice in one job, once on the base commit and once on the head, and compare with `vouqis compare`. Nothing is committed, at the cost of two runs:

```sh
git checkout "$BASE_SHA" && vouqis run vouqis.yaml --output base.json || true
git checkout "$HEAD_SHA" && vouqis run vouqis.yaml --output head.json || true
vouqis compare base.json head.json --suite vouqis.yaml
```

The `|| true` keeps the job going when the base itself has failing cases; `compare` decides the verdict.

## Other CI systems

Any CI that runs Python works:

```sh
pip install git+https://github.com/Sasisundar2211/VouqisVerify
vouqis run vouqis.yaml --baseline vouqis-baseline.json --junit vouqis-junit.xml --markdown vouqis-report.md
```

`--junit` produces JUnit XML for test-report views (GitLab, Jenkins, CircleCI, Azure Pipelines). `--format json` prints the full result for custom tooling.
