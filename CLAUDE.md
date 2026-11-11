# Notes for Claude

## Releases (standing instruction from the owner)

The owner does not want to do anything by hand for a release: every new version must show up in the
in-app update right away. For every new version:

1. Bump `apps/desktop/package.json` `version`, run `pnpm test` and `pnpm typecheck` in `apps/desktop`.
2. Bring the change into `main` (from a cloud session: push the work branch, open a pull request, merge it
   yourself as soon as its checks are green).
3. Start the workflow **Release Windows EXE** (`.github/workflows/release.yml`, `workflow_dispatch`) on `main`
   with `version` = the new version without the `v`. It checks the version, builds the installer and creates
   the tag `v<version>` and the GitHub release with `latest.yml`, which the in-app updater reads.
   (A cloud session cannot push tags, so use the workflow. From the desktop, pushing the tag works too.)
4. Check that the run succeeded and the release exists, then tell the owner.

Code signing (SignPath Foundation) switches on by itself in `release.yml` once the secret `SIGNPATH_API_TOKEN` and the
variable `SIGNPATH_ORGANIZATION_ID` exist. Every signing request then waits for the owner's approval in SignPath:
tell the owner when a release is waiting for it.

The in-app update only sees **releases**, not commits: without step 3 the app says there is no update.

## Checks

- `apps/desktop`: `pnpm test` (unit tests), `pnpm typecheck`
- UI preview without Electron: `pnpm preview:browser` (port 5199)
