from django.contrib.postgres.fields import ArrayField
from django.db import models

from .choices import INSTRUMENTS


class Track(models.Model):
    """
    This model help us to store midi files.
    It will be easier for everyone to have one place to listen
    to the midi without having to install codecs, timidity or whatever
    """
    title = models.CharField(max_length=255)
    midi_file = models.FileField()
    is_discarded = models.BooleanField(default=False)
    photo = models.ImageField(blank=True, null=True)
    original_song_yt_link = models.URLField(blank=True, null=True)

    class Meta:
        ordering = ["title", ]
        verbose_name = 'Morceau'
        verbose_name_plural = 'Morceaux'

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

    class Meta:
        ordering = ["start_date", ]
        verbose_name = "page \"Est-ce que c'est bientôt...\""
        verbose_name_plural = "pages \"Est-ce que c'est bientôt...\""

    def __str__(self):
        return self.slug

    def get_answers(self, date):
        if date < self.start_date:
            return self.answers_before
        elif date <= self.end_date:
            return self.answers
        else:
            return self.answers_expired


class Event(models.Model):
    title = models.CharField(max_length=255)
    date = models.DateField()
    displayed_date = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    location = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=255, blank=True)
    event_url = models.URLField(blank=True, null=True)

    class Meta:
        ordering = ('-date', )
        verbose_name = 'évenement'
        verbose_name_plural = 'évenements'

    def __str__(self):
        return self.title


class People(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    photo = models.ImageField(blank=True, null=True)
    is_dead = models.BooleanField(default=False)
    instrument = models.CharField(max_length=255, choices=INSTRUMENTS)

    class Meta:
        verbose_name = "personne"
        verbose_name_plural = "personnes"
        ordering = ('instrument', 'name', )

    def __str__(self):
        return self.name


class Application(models.Model):
    who = models.ForeignKey(People, verbose_name="who", on_delete=models.CASCADE)
    what = models.CharField(max_length=255)

    def __str__(self):
        return "{} {}".format(self.who, self.what)
