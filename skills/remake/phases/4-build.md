# Phase 4: build

Goal: build the copy from the measurements, not from memory or by eye. Reads
`.remake/recon.md`, `.remake/plan.md`, `.remake/measure/`. Writes the project.

## The rules for this phase

- **Numbers come from `measure/`.** Font size, line height, padding, gaps, radii, shadows,
  colours and transition times are read from the measurements, not guessed. When two
  values are close, snap to the cleaner one and use it everywhere.
- **Tokens only.** Put every value in one place (CSS custom properties or the Tailwind
  theme). No raw colours or pixel values in components.
- **No hotlinks.** Nothing loads from the original's domain or CDN, in either mode. Host
  your own files.
- **Match mode: write everything fresh.** Your own words, your own images and icons, an
  open font, your own accent colour. Matching what a button does is parity. Matching its
  sentence is copying. For photos, use plain placeholders, generated shapes, or images
  the user supplies or has a licence for.
- **Mine mode with a mirror:** start from `.remake/mirror/<host>/`. Turn the saved pages
  into a tidy project (one place for styles, files in sensible folders), remove tracking
  scripts the owner did not ask to keep, and replace anything that needs a server with a
  real implementation. The mirror is a starting point, not the deliverable.

## Order

1. **Tokens and primitives.** Colours by role, type scale, spacing scale, radii, shadows.
   Then the repeated parts: buttons, inputs, cards, nav, footer, each with the states the
   recon found plus focus, disabled, loading and error.
2. **The shell.** Layout, nav and routes for every page in scope.
3. **One page, finished.** The one with the most variety. Get it past the bar in phase 5
   before building the rest. What you learn here saves rework on every other page.
4. **The rest of the pages,** top to bottom, all four widths each.
5. **The backend,** for apps: the data layer on the Antideploy database, sign-in with
   Antideploy's sign-in, uploads to the bucket, mail through the email service. Seed
   data is obviously fake. Time in UTC, shown in the visitor's zone.
6. **Motion.** Use the measured durations and easings for hover, focus, menus and modals.

## For every page

- works at 1440, 1024, 768 and 390 wide
- every state the recon saw: empty, loading, filled, error, long content
- semantic HTML, labels on inputs, visible focus, keyboard reachable, alt text
- a real title, description and icon of its own (in match mode, never the original's)
- no console errors

Commit once per page if the project is a git repo.

## When it is harder than it looked

Say so, in the chat and in `.remake/build-log.md`, one line per page: done or partial,
what is missing, what was harder. Do not quietly ship half of something.

## Done when

Every page in scope exists and runs locally. Set `phase` to 5.
