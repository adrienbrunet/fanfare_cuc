import random
import pytz

from datetime import date, datetime

from django.shortcuts import get_object_or_404
from django.views.generic.base import TemplateView
from django.views.generic.list import ListView

from .models import Event, QuestionPage, People, Track


class LandingPage(TemplateView):
    template_name = 'landing_page.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        today = datetime.now(pytz.utc)
        context["events"] = Event.objects.filter(date__gt=today)
        return context


class PresentationView(ListView):
    model = People
    template_name = 'presentation.html'


class SetListView(ListView):
    queryset = Track.objects.filter(is_discarded=False)
    template_name = 'setlist.html'


class MidiView(ListView):
    model = Track
    template_name = 'midi.html'


class QuestionPageView(TemplateView):
    template_name = "question_page.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        question_page = get_object_or_404(QuestionPage, slug=kwargs["slug"])
        today = date.today()

        answers = question_page.get_answers(today)
        random.shuffle(answers)
        context["answer"] = answers[0]
        return context


class EventListView(ListView):
    template_name = 'event_list.html'
    model = Event


class ClickAndDragView(TemplateView):
    template_name = "click_and_drag.html"
