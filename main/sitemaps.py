from django.contrib.sitemaps import Sitemap
from django.urls import reverse


class StaticViewSitemap(Sitemap):
    changefreq = 'weekly'
    priority = 0.5

    def items(self):
        return [
            'landing_page',
            'presentation',
            'setlist',
            'events',
            'click-and-drag',
            'fanfare-paris',
            'paris',
        ]

    def location(self, item):
        return reverse(item)
