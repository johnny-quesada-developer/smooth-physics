import type { APIRoute } from 'astro';

// Search engines read robots.txt at the host root; this copy under the base path names the sitemap for tools that
// look here, and the sitemap is also submitted in Google Search Console.
export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/sitemap-index.xml`, site).href;
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`, { headers: { 'Content-Type': 'text/plain' } });
};
