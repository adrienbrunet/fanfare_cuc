from django import forms

from .models import Application, People


class ApplicationForm(forms.ModelForm):
    class Meta:
        model = Application
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["who"].queryset = People.objects.filter(is_dead=False)
