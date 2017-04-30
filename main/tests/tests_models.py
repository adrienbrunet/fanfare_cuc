from django.test import TestCase

from ..models import Track


class TrackTest(TestCase):
    def test_str(self):
        track = Track(title="foo")
        assert track.__str__() == "foo"
