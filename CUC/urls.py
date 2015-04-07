# coding: utf-8

# DJANGO
from django.conf.urls import patterns, include, url
from django.contrib import admin

# OUR WEBAPP
from main import views

urlpatterns = patterns('',
    url(r'^$', views.LandingPage.as_view(), name='manding_page'),
    url(r'^admin/', include(admin.site.urls)),
)
