# coding: utf-8


from django.views.generic.base import TemplateView
from django.views.generic.list import ListView

from .models import Track


class LandingPage(TemplateView):
    template_name = 'landing_page.html'


class TourPulignyView(TemplateView):
    template_name = 'puligny.html'


class PresentationView(TemplateView):
    template_name = 'presentation.html'


class MidiView(ListView):
    model = Track
    template_name = 'midi.html'
