from django import forms
from django.contrib import admin
from django.contrib.postgres.forms import SplitArrayField

from import_export.admin import ImportExportModelAdmin

from .models import Event, People, QuestionPage, Track


class MyAdminSite(admin.AdminSite):
    # Text to put at the end of each page's <title>.
    site_title = 'Fanfare CUC admin'

    # Text to put in each page's <h1> (and above login form).
    site_header = 'Fanfare CUC administration zone'

    # Text to put at the top of the admin index page.
    index_title = 'Fanfare CUC administration'


admin_site = MyAdminSite()


class EventAdmin(ImportExportModelAdmin):
    list_display = (
        '__str__', 'title', 'description', 'date', 'displayed_date',
        'location', 'city', 'event_url'
    )
    list_editable = (
        'title', 'description', 'date', 'displayed_date',
        'location', 'city', 'event_url'
    )
    list_filter = ('date', 'location', 'city')


class PeopleAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'get_instrument_display', 'is_dead', )
    list_filter = ('instrument', 'is_dead', )


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


class TrackAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'is_discarded', )
    list_filter = ('is_discarded', )


admin_site.register(Event, EventAdmin)
admin_site.register(People, PeopleAdmin)
admin_site.register(QuestionPage, QuestionPageAdmin)
admin_site.register(Track, TrackAdmin)
