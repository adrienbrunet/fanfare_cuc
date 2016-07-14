# coding: utf-8

# DJANGO
from django.conf.urls import patterns, include, url
from django.contrib import admin

# OUR WEBAPP
from main import views

urlpatterns = patterns(
    '',
    url(r'^$', views.LandingPage.as_view(), name='landing_page'),
    url(r'^admin/', include(admin.site.urls)),
    url(r'^est-ce-que-cest-bientot-le-tour-a-puligny/', views.TourPulignyView.as_view(), name="puligny"),
    url(r'^presentation/', views.PresentationView.as_view(), name="presentation"),
)
