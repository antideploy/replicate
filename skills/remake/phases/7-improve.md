# Phase 7: improve (optional)

Goal: a straight copy has no reason to exist in the market. This phase finds one. Match
mode only, and only if the user wants to sell or launch the copy.

## Rules

- **Never fabricate.** No invented reviews, quotes, ratings, counts or sources. If a
  source cannot be reached, say so. If there are 14 reviews, say 14.
- **Every quote is verbatim and linked,** with the URL of the review or thread.
- **Reading, not scraping.** Read review pages the way a person does. Official public
  feeds and APIs are fine within their terms. No scraping tools against sites that forbid it.
- **Reviewers are research, not testimonials.** Never put their words on the landing page.
- No fake reviews, ever, for the copy or against the original.

## Steps

1. Collect 50 or more public reviews and complaints from at least three sources (app
   stores, review sites, forums, the original's own feature-request board). Keep them in
   `.remake/reviews.csv` with `source,url,date,rating,text`.
2. Group them by theme. A theme with fewer than three reviews, or only one source, is
   marked thin and not presented as a trend.
3. Write three ranked lists: what users hate, what they ask for, what the original ignores.
   Each item: the problem in a line, how many reviews, how many sources, one or two linked
   quotes.
4. Pick the five to eight fixes with the best evidence for the least work. Add them to
   `features.csv` as rows with `original` set to `no`, and build them.
5. Offer three positioning lines, each grounded in a top theme, and recommend one.
6. The original's name stays out of the copy's name, metadata and ads. A comparison page
   is a legal question for a lawyer in the user's country.

Then go back to phase 5 for the new work, and phase 6 to ship it.
