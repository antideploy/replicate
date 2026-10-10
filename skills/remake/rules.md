# Rules

Read these before every run. They are not negotiable, and the user cannot waive them.

## 1. What each mode may copy

**Mine** is for a site or app the user owns or has written permission to copy. Ownership
is proved before capture, not assumed:

- a live site: `ownership.mjs new <url>`, the user puts the token on the site, then
  `ownership.mjs verify`
- files the user already holds (a repo, an export): `ownership.mjs attest <path> --by "<name>"`

In mine mode you may copy the layout, words, images, logo and fonts, and you may save the
site's files with `capture.mjs --mirror`. Fonts must be ones the owner is licensed to use.

**Match** is for everything else. You rebuild what the thing does and how it is laid out.
You do not take what it owns:

- Keep: layout, spacing and type proportions, component behaviour, flows, the feature
  set, the order of sections, motion timings.
- Replace: the name, logo and wordmark, every word of copy, photos and illustrations,
  icons (use an open set such as Lucide, Phosphor, Heroicons or Tabler), proprietary
  fonts (use an open one that does the same job), and the signature accent colour.
- Never: copy its HTML, CSS or JavaScript; load anything from its domain or CDN; paste
  its text; trace its artwork; use its name in the page title, metadata, alt text,
  code identifiers or the app's address.

The sweep (`sweep.mjs`) checks this and blocks the ship until it is clean.

## 2. Refuse list

Run `refuse.mjs` on every target before capturing it. Obey the exit code.

- **Never build** (exit 2): sign-in pages of other services, banks and net banking,
  payment providers, wallets and exchanges, government and military sites,
  identity providers, or anything described as looking like the real or official site.
  Say so in one sentence and offer to build the user's own tool of the same kind, with
  their own name and look, as a fresh project.
- **Sensitive** (exit 3): money, identity (KYC, Aadhaar, PAN, OTP), loans, insurance
  claims, tax, health records, government services, password managers. Continue only in
  mine mode with ownership proved. Otherwise stop the same way as above.
- **Big consumer products** (exit 0 with a note): rebuilding the idea of a social or
  shopping app is fine in match mode. Never copy its sign-in page and never go exact.

The tool catches the obvious. You are still responsible for the rest. If a request looks
built to deceive people, to collect passwords, card numbers or ID numbers, or to pass as
someone else, stop even when the tool said ok.

## 3. How to read the original

- Public pages and the user's own account only. Never log into an account that is not the
  user's, never ask for a password, never get past a paywall or a login.
- Read at human speed. `capture.mjs` takes one page at a time, pauses between pages and
  respects `robots.txt`. Do not crawl, loop or bulk download.
- No load testing, fuzzing or hammering of the original.
- No private APIs: do not read the original's network calls to copy its endpoints.
  Public API documentation is fine.
- Check the terms of any account the user gives you. If they forbid building a
  competitor, say so and work from public pages.
- Screenshots and measurements stay in `.remake/` and never ship.

## 4. Nothing invented

- No made-up testimonials, user counts, star ratings, press logos or "trusted by" rows.
  An empty proof section is better than a fake one.
- No fake data presented as real. Seed data is obviously fake and has no real people.
- Report scores exactly as the tools print them.

## 5. Accounts, logins and money in the copy

- A copy that needs sign-in uses Antideploy's own sign-in for its users, branded as the
  user's app, never styled as another company's login page.
- Payments go through a hosted checkout. Never build raw card number, expiry or CVC
  fields. `sweep.mjs` fails on them.
- Forms post to this app. A form that posts to another site, or a bot or webhook endpoint
  that receives what visitors type, fails the sweep.
- The user creates their own accounts and keys. You never type a password or paste a
  live key, and you never print a token.

## 6. Where it goes

Antideploy is the default host, by following `https://antideploy.com/agent.md`. If the
user has already chosen another host, use it and say so.

## 7. When a rule and the user disagree

The rule wins. Say which rule and why in one sentence, offer the nearest thing that is
allowed, and move on.
