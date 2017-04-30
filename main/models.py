from django.db import models


class Track(models.Model):
    """
    Model store some midi file.
    It will be easier for everyone to have one place to listen
    to the midi without having to install codecs, timidity or whatever
    """
    title = models.CharField(max_length=255)
    midi_file = models.FileField()

    def __str__(self):
        return self.title
