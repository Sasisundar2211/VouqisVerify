import type { MetadataRoute } from 'next'

const BASE_URL = 'https://vouqis.tech'

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ['', '/docs', '/blog', '/changelog', '/design-partner']

  return routes.map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' ? 'weekly' : 'monthly',
    priority: route === '' ? 1 : 0.6,
  }))
}
