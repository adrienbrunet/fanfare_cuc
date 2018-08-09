from django.urls import include, path
from django.contrib.sitemaps.views import sitemap

from main.sitemaps import StaticViewSitemap


sitemaps = {
    'static': StaticViewSitemap,
}

urlpatterns = [
    path('', include('main.urls')),
    path(
        'sitemap.xml',
        sitemap,
        {'sitemaps': sitemaps},
        name='django.contrib.sitemaps.views.index'
    ),
]
