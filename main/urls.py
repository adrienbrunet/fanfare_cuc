from django.urls import path, re_path

from CUC import admin
from . import views

urlpatterns = [
    path("admin/", admin.site.urls),
    path(
        '',
        views.LandingPage.as_view(),
        name='landing_page'
    ),
    path(
        'fanfare-paris',
        views.LandingPage.as_view(),
        name='fanfare-paris'
    ),
    path(
        'paris',
        views.LandingPage.as_view(),
        name='paris'
    ),
    path(
        'presentation/',
        views.PresentationView.as_view(),
        name="presentation"
    ),
    path(
        'midi/',
        views.MidiView.as_view(),
        name="midi"
    ),
    path(
        'repertoire/',
        views.SetListView.as_view(),
        name="setlist"
    ),
    re_path(
        r'^est-ce-que-cest-bientot-(?P<slug>[-\w]+)/$',
        views.QuestionPageView.as_view(),
        name="question"
    ),
    path(
        'click-and-drag/',
        views.ClickAndDragView.as_view(),
        name="click-and-drag"
    ),
    path(
        'events/',
        views.EventListView.as_view(),
        name="events"
    ),
    path(
        'aaa',
        views.aaa,
        name="aaa"
    ),
    path(
        'candidature',
        views.ApplicationView.as_view(),
        name="application"
    ),
    path(
        'candidature-success',
        views.ApplicationSuccess.as_view(),
        name="application-success"
    )
]
