from django.conf.urls import url

from . import views


urlpatterns = [
    url(r'^$',
        views.LandingPage.as_view(),
        name='landing_page'),
    url(r'^presentation/$',
        views.PresentationView.as_view(),
        name="presentation"),
    url(r'^midi/$',
        views.MidiView.as_view(),
        name="midi"),
    url(r'^est-ce-que-cest-bientot-(?P<slug>[-\w]+)/$',
        views.QuestionPageView.as_view(),
        name="question"),
]
