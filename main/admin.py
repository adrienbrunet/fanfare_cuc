from django import forms
from django.contrib import admin
from django.contrib.postgres.forms import SplitArrayField

from .models import Event, QuestionPage, Track


class QuestionPageForm(forms.ModelForm):
    answers = SplitArrayField(
        forms.CharField(max_length=1024, required=False),
        10,  # number of CharField displayed
        remove_trailing_nulls=True)
    answers_before = SplitArrayField(
        forms.CharField(max_length=1024, required=False),
        10,  # number of CharField displayed
        remove_trailing_nulls=True)
    answers_expired = SplitArrayField(
        forms.CharField(max_length=1024, required=False),
        10,  # number of CharField displayed
        remove_trailing_nulls=True)

    class Meta:
        model = QuestionPage
        fields = "__all__"


class QuestionPageAdmin(admin.ModelAdmin):
    form = QuestionPageForm


class EventAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'title', 'description', 'date', 'location', 'image')
    list_editable = ('title', 'description', 'date', 'location', 'image')
    list_filter = ('date', 'location')


admin.site.register(Event, EventAdmin)
admin.site.register(QuestionPage, QuestionPageAdmin)
admin.site.register(Track)
