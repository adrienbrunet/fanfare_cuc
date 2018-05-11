from django.urls import path, re_path

from . import views


urlpatterns = [
    path(
        '',
        views.LandingPage.as_view(),
        name='landing_page'
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
        'events/<int:pk>/',
        views.EventDetailView.as_view(),
        name="event_detail"
    ),
]
