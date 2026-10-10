# Phase 1: scope

Goal: agree what is being remade, in which mode, that it is safe to do, and how big it is.
Writes `.remake/state.json`.

## Steps

1. **Ask what to remake and who it is for.** One question, with your own guess in it.
   Web only for now. Native mobile and desktop apps are out of scope: say so.

2. **Run the first gate.**

   ```bash
   node tools/refuse.mjs "<url or name>" --text "<the user's own words>"
   ```

   - Exit 2: stop. One sentence on why, and offer to build the user's own tool of the
     same kind with their own name and look. That is a fresh project, not a remake.
   - Exit 3: sensitive. Continue only in mine mode with ownership proved (step 4).
     Otherwise stop the same way.
   - Exit 0: read any note it prints and keep it in mind.

3. **Pick the mode.** Ask: "Is this site or app yours, or do you have written permission
   to copy it?"
   - Yes: mine mode, an exact copy.
   - No, or "sort of": match mode. Never talk the user into mine mode.

4. **Mine mode needs proof first.**
   - Live site: `node tools/ownership.mjs new <url>`. Tell the user where to put the
     token (a meta tag in the home page head, or a file at `/.well-known/remake.txt`).
     When they say it is there, run `node tools/ownership.mjs verify`.
   - Files the user holds: `node tools/ownership.mjs attest <path> --by "<their name>"`.
   - No proof means no mine mode. Offer match mode instead.

5. **Pick the slice.**
   - A marketing site: every public page, up to 30.
   - An app: the core loop and the screens it passes through. "All of Notion" is not a
     project. "Pages, blocks and sharing" is.

6. **Size it honestly.**
   - S: one page, or a small site with no accounts.
   - M: a few pages with forms, or one simple flow with sign-in.
   - L: a real app with accounts, saved data and several flows.
   - XL: too big. Propose a smaller slice.
   Give a time only as a guess, and say it is a guess until the first page is done.

7. **Write the state.** Copy `templates/state.json` to `.remake/state.json` and fill in
   mode, target, pages and slice. Make sure `.remake/` is in `.gitignore`. Copy
   `templates/remake.json` to the project root as `remake.json` and set the mode.

## Ask: yes number 1

Say it in four lines: the mode, what is being remade, the pages or flows, the size. Say
that the match will be scored and that you will stop and report if the score cannot be
reached. Wait for yes. Then set `approved.scope` to true and go to phase 2.
