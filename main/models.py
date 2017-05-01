from django.contrib.postgres.fields import ArrayField
from django.db import models


class Track(models.Model):
    """
    This model help us to store midi files.
    It will be easier for everyone to have one place to listen
    to the midi without having to install codecs, timidity or whatever
    """
    title = models.CharField(max_length=255)
    midi_file = models.FileField()

    def __str__(self):
        return self.title


class QuestionPage(models.Model):
    """
    To avoid to write again and again stupid view for urls:
    est-ce-que-cest-bientot-xxxxxx
    with some response
    """
    slug = models.SlugField(max_length=255)
    start_date = models.DateField()
    end_date = models.DateField()
    answers = ArrayField(models.CharField(max_length=1024, blank=True))
    answers_before = ArrayField(models.CharField(max_length=1024, blank=True))
    answers_expired = ArrayField(models.CharField(max_length=1024, blank=True))

    def __str__(self):
        return self.slug

    def get_answers(self, date):
        if date < self.start_date:
            return self.answers_before
        elif date < self.end_date:
            return self.answers
        else:
            return self.answers_expired
