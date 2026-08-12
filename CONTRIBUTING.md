## Contributing

Read the [Vouqis Codebase Standard](docs/codebase-standard.md) before making a
change. It defines the repository's required source, test, dependency, and CI
practices.

For Vouqis Verify development and release instructions, see
[`packages/verify/CONTRIBUTING.md`](packages/verify/CONTRIBUTING.md).
Open an issue first to discuss the change, then submit a pull request against `main`. Please keep PRs focused — one feature or fix per PR. All contributions are released under the MIT license.

## Branches

Never commit directly to `main`. Create a branch per change, named after its
kind: `feature/<short-name>`, `fix/<short-name>`, or `chore/<short-name>`.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope):
summary`, e.g. `feat(cli): add --json output flag` or `fix(verify): reject
invalid vouqis.yml`. Common types: `feat`, `fix`, `docs`, `refactor`, `chore`,
`ci`, `test`. Keep commits atomic — one logical change per commit — rather
than bundling unrelated work.

## Branch protection

`main` is expected to have GitHub branch protection enabled: require a pull
request before merging, require the `quality` and `test` checks from
[`ci.yml`](.github/workflows/ci.yml) to pass, and disallow direct pushes.
Configure this under the repo's Settings → Branches.
