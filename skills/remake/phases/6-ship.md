# Phase 6: ship

Goal: put it live on Antideploy. Writes `.remake/ship.md`.

## Gates

Any failure stops the ship. Say which one and why.

- [ ] `node tools/refuse.mjs "<target>"` still exits 0 (or ownership is proved)
- [ ] `node tools/fidelity.mjs` says PASS
- [ ] `node tools/parity.mjs .remake/features.csv` shows no must-have missing (apps)
- [ ] `node tools/sweep.mjs .` is clean (`--safety-only` in mine mode)
- [ ] no console errors or failed requests in `.remake/clone-capture.json`
- [ ] `remake.json` is in the project root, and `.remake/` is in `.gitignore`

## What goes up

Everything except `.remake/`, `node_modules`, `.git` and any `.env` file. The screenshots
and measurements of the original never ship. Check the upload list before you send it.

## Ask: yes number 3

Show the numbers (score per page against the bar), the address it will have, and what
Antideploy now holds for the project. Ask: "Go live?" Wait for yes. Set `approved.golive`
to true.

## Deploy

The same sentence as phase 3, which by now has connected the project:

```text
Set this project up to deploy on Antideploy. Fetch https://antideploy.com/agent.md and follow it.
```

Follow agent.md sections 4 to 7:

- deploy, then watch the deploy until it succeeds or fails
- if it fails, read `error` from the deploy history and the logs before changing anything,
  fix the project, and deploy again. A project that builds and never listens on its port
  is the usual cause: read `PORT`, listen on `0.0.0.0`. Do not redeploy unchanged
- tell the user where it is live and on which Antideploy account, using the `summary`
  the deploy status returns
- an automatic security check runs on the live app. If it finds anything, tell the user
  and offer to fix it, then redeploy
- ask the user once, in their words, about the services the deploy status suggests

## Afterwards

- **A custom domain** is the user's step, in the browser, on the app's Domains tab. Give
  them the address of the page and say what to type.
- **Mine mode, moving a live site:** the DNS change is the user's, at their registrar.
  Keep the old site up until they have checked the new one.
- Run the clone capture once more against the live address and score it. The live numbers
  are the ones to report.

## Report

Write `.remake/ship.md` and tell the user, in this order: the live address and the account,
the fidelity numbers per page, what is not matched and why, what the sweep and the
security check found.
