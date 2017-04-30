from django.conf.urls import url

from . import views


urlpatterns = [
    url(r'^$',
        views.LandingPage.as_view(),
        name='landing_page'),
    url(r'^est-ce-que-cest-bientot-le-tour-a-puligny/',
        views.TourPulignyView.as_view(),
        name="puligny"),
    url(r'^presentation/',
        views.PresentationView.as_view(),
        name="presentation"),
]
