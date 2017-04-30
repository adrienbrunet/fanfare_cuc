from django.test import TestCase

from ..models import QuestionPage, Track


class TrackTest(TestCase):
    def test_str(self):
        track = Track(title="foo")
        assert track.__str__() == "foo"


class QuestionpageTest(TestCase):
    def test_str(self):
        question_page = QuestionPage(slug="foo")
        assert question_page.__str__() == "foo"
