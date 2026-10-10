# Phase 2: capture

Goal: measure the original so the copy is built from numbers. Writes `.remake/screens/`,
`.remake/measure/`, `.remake/capture.json`, `.remake/assets.json`, `.remake/recon.md`,
`.remake/features.csv` and `.remake/brand.json`.

## Steps

1. **Set up the browser tool.** In the project: `npm i -D playwright-core`. It uses the
   Chrome already on the machine. If there is none, `npx playwright-core install chromium`.

2. **Capture.**

   ```bash
   node tools/capture.mjs https://example.com/ https://example.com/pricing --out .remake
   ```

   It takes full-page screenshots at 1440, 1024, 768 and 390 wide, the computed style of
   every visible element, how each button and link changes on hover and focus, headings,
   links, forms, fonts, and a fingerprint of every image and font.
   - A cookie banner in the way: add `--click "text=Accept"`.
   - A site whose ownership is proved and has no source to start from: add `--mirror`.
   - It stops at `robots.txt`. Do not work around that.
   - If it prints a sign-in page WARNING, stop. Do not copy it (rules.md).

3. **Look at what it captured.** Open the screenshots yourself, at 1440 and 390 at least.
   A capture you have not looked at is not a capture. Check nothing is covered by a
   banner, a spinner or a half-loaded section.

4. **Write the recon map.** Copy `templates/recon.md` to `.remake/recon.md` and fill it
   from `capture.json` and `measure/`:
   - pages and their sections, top to bottom
   - **tokens**: colours by role (not by value), type scale, spacing scale, radii,
     shadows. Take the values from `measure/`, then snap them to a clean scale.
   - components with their variants and states, from the hover and focus results
   - what changes between widths: what stacks, hides, reflows, shrinks
   - forms: every field, what it submits, what happens after
   - fonts: which are open and which are licensed
   - motion: the durations and easings that were measured
   - what cannot be matched, and why (video, live data, third-party widgets)

5. **Feature matrix (apps).** Copy `templates/features.csv` to `.remake/features.csv`,
   one row per thing a user can do, priority must, should or could. Set `clone` to `no`
   for every row. Phase 5 scores it.

6. **Brand file (match mode).** Copy `templates/brand.json` to `.remake/brand.json` and
   list the original's names, domains, and its signature colours (the accent on buttons
   and links, and any colour in its logo). The sweep uses it.

7. **Match mode: notes, not content.** In `recon.md`, write the original's name, logo,
   words and images only as *things to replace*. Do not copy its text into the project.

8. **Behind a login.** Only the user's own account, with the user present, and only in mine
   mode with ownership proved: ask them to save a browser session and pass it with
   `--storage-state`. Never ask for a password.

## Done when

`recon.md` exists, you have looked at the screenshots, and every page in the scope has a
screenshot at every width. Set `phase` to 3 in `state.json`.
