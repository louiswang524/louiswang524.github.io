# Technical Blog Writing Rules

When writing or helping write a technical blog post for this site, follow these practices.

## Research & Citations

- Find and link the original paper or primary source for every claim, method, or model name mentioned (arXiv, ACL Anthology, NeurIPS, engineering blogs, etc.)
- Prefer citing the original paper over a secondary blog summary
- If a paper cannot be found, note the claim as unverified rather than stating it as fact
- For industry techniques without papers (e.g. internal systems), cite the original engineering blog post
- Collect all citations into a **References** section at the end of the post

## Structure & Clarity

- Open with a concrete hook — a problem, a surprising fact, or a question the reader already has
- Use a concept-first structure: explain the *why* before the *what*, and the *what* before the *how*
- Each section should answer one question; if it answers two, split it
- Use tables for comparisons, numbered lists for sequences, bullet lists for unordered sets
- Define acronyms and technical terms on first use; never assume familiarity
- End with a "so what" — what should the reader do or think differently after reading?

## Logic & Accuracy

- After drafting, do a logic pass: check that each claim follows from the previous one
- Flag any section where the reasoning is hand-wavy or skips steps — either fill the gap or explicitly acknowledge the simplification
- Verify that numbers, dates, and model names are accurate before publishing
- If two sources conflict, note the discrepancy rather than picking one silently
- Do not overstate results: use "suggests", "indicates", or "in this setting" when evidence is limited

## Tone & Accessibility

- Write for a technically literate reader who is not yet an expert in this specific topic
- Avoid jargon stacking — no more than one new term per sentence
- Use concrete examples and analogies to ground abstract concepts
- Keep sentences short; split any sentence over 30 words
- Avoid filler phrases: "it is worth noting that", "needless to say", "as we can see"

## SEO & Metadata

- Title should name the core concept explicitly (good for search and for reader clarity)
- Meta description should state the post's central argument in one sentence
- Tags should reflect the specific technical concepts covered, not just broad categories
- Include relevant paper titles and author names in the body text (helps surface in searches)
- Escape `$` as `\$` in Markdown to prevent KaTeX from parsing dollar amounts as math

## Publishing

- Blog posts live in `src/content/blog/` as `.md` files
- Frontmatter fields: `title`, `description`, `date` (YYYY-MM-DD), `tags` (array), `draft` (optional boolean)
- Run `git push origin main` to trigger the GitHub Actions deploy to GitHub Pages
