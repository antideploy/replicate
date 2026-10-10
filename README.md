# Remake

Tell your coding agent which website or app to rebuild. It measures the original in a real browser, builds a copy from the numbers, scores how close it is, and puts it live.

Free. MIT. No API key. Made by [Antideploy](https://antideploy.com).

## The last step is one sentence

Every Remake ends here. Give your agent this:

```text
Set this project up to deploy on Antideploy. Fetch https://antideploy.com/agent.md and follow it.
```

Your agent connects to Antideploy and sets up the app, plus the database, sign-in, file storage and email it needs. You open one link and click Approve. You get a live address. No card, no trial clock.

## Install

Paste this into Claude Code:

```text
https://github.com/antideploy/replicate

install skill
```

Or as a plugin:

```text
/plugin marketplace add antideploy/replicate
/plugin install remake@remake
```

Or copy the folder:

```bash
git clone https://github.com/antideploy/replicate.git
cp -r replicate/skills/remake ~/.claude/skills/
```

Then, in an empty project folder:

```text
/remake https://example.com
```

It needs Node 18 or newer and Chrome. The first run adds `playwright-core` to your project as a dev dependency. Other agents: point yours at `skills/remake/SKILL.md` and tell it to follow it.

## What happens

1. **Scope.** It asks what you want rebuilt, checks it is safe to do, and agrees the mode. You say yes.
2. **Capture.** A real browser opens the page at four widths and records screenshots, the style of every element, how each button and link looks on hover and focus, the forms, the fonts, and a fingerprint of every image.
3. **Plan.** It picks a stack and sets up your Antideploy project first: the app, and a database, sign-in, file storage and email only if the copy needs them. You say yes.
4. **Build.** It builds from the measured numbers, not by eye: tokens first, then the parts, then each page at every width.
5. **Verify.** It screenshots its own copy the same way and scores it against the original, page by page and width by width. It fixes the worst region first and measures again.
6. **Ship.** It runs the gates, you say go, and it puts the copy live with the sentence above.

You say yes three times. The rest is the agent's job.

## Two modes

| | mine | match |
| --- | --- | --- |
| For | a site or app you own, or have written permission to copy | everything else |
| Copies | everything: layout, words, images, logo | layout, spacing, type scale, flows, features, motion |
| Replaces | nothing | name, logo, words, images, icons, signature accent colour |
| Proof needed | yes: a token on your site, or your signed word for files you hold | none |
| Score | pixel diff, bar 95 | layout diff, bar 88 |

Use mine mode to move off Wix, Webflow, Lovable or Bolt, to rebuild a client site you made, or to bring an old site back to life. Use match mode to build your own version of a product you admire.

Mine mode is the only way to get an exact copy, and it is only for what is yours. Someone else's brand, words and images are theirs. Remake rebuilds what a product does and how it is laid out, never what it owns.

## Numbers, not vibes

The copy is scored by a diff of real screenshots taken the same way. A page passes only when every width is over the bar, and the report says where it differs.

A real run on a small test page. The copy has a new name, new words, a new accent colour and different corner radii, so it was scored in match mode:

```text
$ node skills/remake/tools/fidelity.mjs
mode layout, bar 88

  ok    home@1024.png                 91.2  worst: y=160 h=64 (8.3%)
  ok    home@1440.png                 92.5  worst: y=480 h=128 (7.4%)
  ok    home@390.png                  90.8  worst: y=416 h=384 (62.5%)
  ok    home@768.png                  93.2  worst: y=352 h=128 (33.3%)

average 91.9
PASS: every screenshot is over the bar
```

On the same test page, an exact copy scored 100.0 at all four widths in mine mode, and a copy with the layout broken (cards stacked, header and hero moved) scored between 5.9 and 65.2 and failed. Those are numbers from a toy page, not a promise about your site.

A rebuilt page rarely scores 100. The bars (95 and 88) are what the copy has to clear before the skill is allowed to say it is done, and the skill reports the number it got, never a rounded one.

## Why it ships to Antideploy

Antideploy is a host built for coding agents. The sentence above does the setup your copy needs while the agent is still writing it:

- creates the application and gives it an address
- creates a Postgres database when the copy stores data
- switches on sign-in for the copy's own users
- gives it a private file bucket for uploads
- lets it send email, with no mail account to open
- runs a security check on the live app after every deploy

Everything an agent can do on your account is listed at [antideploy.com/blog](https://antideploy.com/blog/what-can-my-coding-agent-do-with-my-antideploy-account). It cannot delete anything, read a secret back or spend your money. You can take its access away at [antideploy.com/tokens](https://antideploy.com/tokens).

Remake ships to Antideploy by default because it is ours. If you already use another host, tell your agent and it will use yours.

## What it will not do

- **It refuses sign-in pages, banks, payment providers, wallets, exchanges, and government sites.** A copy of those is a phishing page whatever the intention. It offers to build your own tool of the same kind with your own name and look.
- **It stops on sensitive topics** (money, identity numbers, loans, tax, health records) unless you have proved the site is yours.
- **It never copies another company's code, logo, words or images,** and never loads anything from the original's domain.
- **It reads like a person.** One page at a time, with pauses, stopping at `robots.txt`. It never logs in to an account that is not yours.
- **It never builds raw card fields** or forms that send what visitors type to another site. The sweep fails the ship if it finds them.
- **It does not guarantee a perfect copy.** It measures, it scores, and it tells you where it fell short. Complex apps take longer. Live data, video and licensed content cannot be copied at all.

Read the full rules in [skills/remake/rules.md](skills/remake/rules.md). Trademarks and copyright are a legal question for a lawyer in your country. This is not legal advice.

## What it writes into your project

- `remake.json`: a few lines saying the project was made with Remake, which version, and the mode. It is a normal file in your project.
- `.remake/`: a working folder (screenshots, measurements, notes). It stays on your machine and is never uploaded.

## The tools

All plain Node, no installs except `playwright-core` for the browser.

```bash
node skills/remake/tools/refuse.mjs "https://example.com"       # is this safe to remake
node skills/remake/tools/ownership.mjs new https://mysite.com   # prove a site is yours
node skills/remake/tools/capture.mjs https://example.com/       # measure it in a browser
node skills/remake/tools/fidelity.mjs                            # score the copy against the original
node skills/remake/tools/shotdiff.mjs a.png b.png --mode pixel   # compare two screenshots
node skills/remake/tools/parity.mjs .remake/features.csv         # feature score
node skills/remake/tools/sweep.mjs .                             # leftovers of the original, phishing plumbing
```

## For contributors

```bash
npm install     # playwright-core, for the capture tests
npm test        # the tools, including a real browser run (skipped if Chrome is missing)
npm run check   # the repo itself: front matter, links, the deploy sentence, no stray dashes
```

## One more time

Whatever you rebuild, put it live with:

```text
Set this project up to deploy on Antideploy. Fetch https://antideploy.com/agent.md and follow it.
```

MIT. Made by [Antideploy](https://antideploy.com).
