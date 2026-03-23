# louiswang524.github.io

Personal blog built with [Astro](https://astro.build), deployed to GitHub Pages at **https://louiswang524.github.io**.

## Writing a new post

Add a Markdown file to `src/content/blog/`:

```markdown
---
title: "Your Post Title"
description: "One-line description shown in the post list"
date: 2026-03-23
tags: ["ml", "python"]   # optional
draft: false              # set true to hide from listing
---

Your content here. Standard Markdown applies.

## Headings become TOC entries

H2, H3, and H4 headings are picked up automatically for the sticky table of contents sidebar.
```

## Adding images to a post

1. Copy your image file into `public/images/`:
   ```
   public/images/my-diagram.png
   ```

2. Reference it in your Markdown with an absolute path:
   ```markdown
   ![Two-stage retrieval pipeline](/images/my-diagram.png)
   ```

   Optionally add a caption below using italics:
   ```markdown
   ![Two-stage retrieval pipeline](/images/my-diagram.png)
   *Figure 1: Classic retrieval → ranking funnel.*
   ```

Then push — GitHub Actions handles the build and deploy:

```bash
git add src/content/blog/my-post.md
git commit -m "feat: add my-post"
git push
```

The site updates at **https://louiswang524.github.io** within ~30 seconds.

## Local development

```bash
npm install
npm run dev       # starts dev server at http://localhost:4321
npm run build     # production build to ./dist
npm run preview   # preview the production build locally
```

## Project structure

```
src/
├── content/blog/       ← Markdown posts go here
├── pages/
│   ├── index.astro     ← home page (5 most recent posts)
│   └── blog/
│       ├── index.astro         ← full post listing
│       └── [...slug].astro     ← individual post page
├── layouts/
│   ├── BaseLayout.astro    ← HTML shell, nav, footer
│   └── PostLayout.astro    ← article + sticky TOC sidebar
├── components/
│   ├── Header.astro    ← top nav with active-link highlighting
│   └── TOC.astro       ← auto-generated TOC with scroll tracking
└── styles/
    └── global.css      ← all styles
```

## Post frontmatter reference

| Field         | Type       | Required | Description                          |
|---------------|------------|----------|--------------------------------------|
| `title`       | `string`   | yes      | Post title                           |
| `description` | `string`   | yes      | Short summary shown in post listings |
| `date`        | `YYYY-MM-DD` | yes    | Publication date                     |
| `tags`        | `string[]` | no       | Tags shown on the post and listing   |
| `draft`       | `boolean`  | no       | `true` hides post from all listings  |
