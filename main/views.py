# coding: utf-8

from datetime import date
import random

from django.shortcuts import get_object_or_404
from django.views.generic.base import TemplateView
from django.views.generic.list import ListView

from .models import QuestionPage, Track


class LandingPage(TemplateView):
    template_name = 'landing_page.html'


class PresentationView(TemplateView):
    template_name = 'presentation.html'


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


class ClickAndDragView(TemplateView):
    template_name = "click_and_drag.html"
