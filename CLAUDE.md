# Notes for Claude

## Releases (standing instruction from the owner)

The owner does not want to do anything by hand for a release: every new version must show up in the
in-app update right away. For every new version:

1. Bump `apps/desktop/package.json` `version`, run `pnpm test` and `pnpm typecheck` in `apps/desktop`.
   Add a section `## <version>` at the top of `CHANGELOG.md` (English, user-facing: what is new, what was fixed).
   The release workflow fails without it and puts it on the GitHub release page. Keep the README's "New in" list in step.
2. Bring the change into `main` (from a cloud session: push the work branch, open a pull request and switch on
   auto-merge (merge commit) so it merges itself as soon as its checks are green; if auto-merge is not possible, merge
   it yourself as soon as they are green).
3. The release starts by itself: **Release Windows EXE** (`.github/workflows/release.yml`) runs on every push to `main`
   that changes `apps/desktop/package.json` and releases the version in it when its tag `v<version>` does not exist
   yet: it builds the installer and creates the tag and the GitHub release with `latest.yml`, which the in-app updater
   reads (the app checks every 15 minutes). Only if it did not run, start it by hand (`workflow_dispatch`, `version`
   without the `v`).
4. Check that the run succeeded and the release exists, then tell the owner, with a short changelog summary in German
   (standing instruction: every release). Release notes carry the changelog and install notes, no donation link
   (that is only on the README).

Code signing (SignPath Foundation) switches on by itself in `release.yml` once the secret `SIGNPATH_API_TOKEN` and the
variable `SIGNPATH_ORGANIZATION_ID` exist. Every signing request then waits for the owner's approval in SignPath:
tell the owner when a release is waiting for it.
Status: the first SignPath Foundation application was declined on 2026-11-11 for too little public visibility
(stars, forks, external references); the owner plans to reapply later. Until then releases stay unsigned.

The in-app update only sees **releases**, not commits: without step 3 the app says there is no update.

## Current state and plans

Read `docs/NEXT-STEPS.md` at the start of a session: what is planned next (feedback, posts in forums and blogs),
open technical items and how the owner likes to work.

## Wiki

The GitHub wiki is generated from `docs/wiki` (workflow `Publish wiki` on every push to `main`). When a menu or
function changes, update the matching page there in the same pull request.

## Checks

- `apps/desktop`: `pnpm test` (unit tests), `pnpm typecheck`
- UI preview without Electron: `pnpm preview:browser` (port 5199)
