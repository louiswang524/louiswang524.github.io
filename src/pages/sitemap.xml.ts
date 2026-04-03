import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(_context: APIContext) {
  const siteUrl = 'https://louiswang524.github.io';

  const posts = (await getCollection('blog', ({ data }) => !data.draft))
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  const staticPages = [
    { url: `${siteUrl}/`, priority: '1.0', changefreq: 'weekly' },
    { url: `${siteUrl}/blog/`, priority: '0.9', changefreq: 'weekly' },
    { url: `${siteUrl}/archive/`, priority: '0.6', changefreq: 'monthly' },
    { url: `${siteUrl}/tags/`, priority: '0.6', changefreq: 'weekly' },
    { url: `${siteUrl}/search/`, priority: '0.5', changefreq: 'monthly' },
  ];

  const postPages = posts.map(post => ({
    url: `${siteUrl}/blog/${post.slug}/`,
    priority: '0.8',
    changefreq: 'monthly',
    lastmod: post.data.date.toISOString().split('T')[0],
  }));

  const allPages = [...staticPages, ...postPages];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages.map(p => `  <url>
    <loc>${p.url}</loc>
    ${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  });
}
