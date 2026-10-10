# Phase 5: verify

Goal: prove the match with numbers, fix the worst parts first, and check nothing is left
over that should not ship. Writes `.remake/clone-screens/`, `.remake/diffs/`.

## Steps

1. **Run the copy locally** and note its address.

2. **Capture the clone the same way as the original.** Same pages, same widths. The page
   paths must match the original's, because the file names come from them (`home@1440.png`,
   `pricing@390.png`).

   ```bash
   node tools/capture.mjs http://localhost:3000/ http://localhost:3000/pricing --role clone --out .remake
   ```

3. **Score it.**

   ```bash
   node tools/fidelity.mjs
   ```

   It compares every page at every width and prints one line each, with the worst region.
   Mine mode uses the pixel diff, match mode the layout diff, which ignores colour and
   words.

4. **Fix the worst first.** Open `.remake/diffs/<name>.png` (red = only in the original,
   blue = only in the clone in layout mode; red = differs in pixel mode) and the region
   coordinates. Fix the biggest region, capture again, score again. At most 6 rounds. If it
   is still under the bar, stop and report the numbers and where it differs. Never edit a
   screenshot, never lower the bar, never say it matches when it does not.

5. **Features (apps).** Update the `clone` column in `.remake/features.csv`, then:

   ```bash
   node tools/parity.mjs .remake/features.csv
   ```

   Every must-have has to be done.

6. **Leftovers and safety.**

   ```bash
   node tools/sweep.mjs .                 # match mode: the original's name, domain, colours, files
   node tools/sweep.mjs . --safety-only   # mine mode
   ```

   Both also fail on raw card fields, forms that post to another site, and bot or webhook
   endpoints that receive what visitors type. Fix until it says `clean`.

7. **Console and requests.** `.remake/clone-capture.json` lists console errors and failed
   requests per page. Both must be empty.

8. **Click through.** Every form submits and shows a result, every link goes somewhere, the
   404 page exists, the keyboard can reach everything.

## Done when

`fidelity.mjs` says PASS, `parity.mjs` shows no must-have missing, `sweep.mjs` says clean,
and the console is quiet. Set `phase` to 6.
