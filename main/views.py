# coding: utf-8

# PYTHON
from datetime import datetime

# DJANGO
from django.shortcuts import render
from django.views.generic.base import TemplateView


class LandingPage(TemplateView):
    template_name = 'landing_page.html'

    def get_context_data(self, **kwargs):
        context = super(LandingPage, self).get_context_data(**kwargs)
        context['today'] = datetime.now()
        context['concert_10_avril'] = datetime(2015, 4, 11)
        context['LTDC15'] = datetime(2015, 9, 4)
        context['endLTDC15'] = datetime(2015, 9, 8)
        return context


class TourPulignyView(TemplateView):
    template_name = 'puligny.html'


class PresentationView(TemplateView):
    template_name = 'presentation.html'
