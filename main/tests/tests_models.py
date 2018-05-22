import datetime

from django.test import TestCase

from ..models import Event, People, QuestionPage, Track


class TrackTest(TestCase):
    def test_str(self):
        track = Track(title="foo")
        assert track.__str__() == "foo"


class QuestionpageTest(TestCase):
    def test_str(self):
        question_page = QuestionPage(slug="foo")
        assert question_page.__str__() == "foo"

    def test_get_answers(TestCase):
        now = datetime.date.today()
        one_year_after = now + datetime.timedelta(days=365)
        two_years_after = now + datetime.timedelta(days=2 * 365)
        tomorrow = now + datetime.timedelta(days=1)
        yesterday = now - datetime.timedelta(days=1)

        question = QuestionPage.objects.create(
            slug="test",
            start_date=now,
            end_date=one_year_after,
            answers=["foo"],
            answers_before=["bar"],
            answers_expired=["baz"])

        assert question.get_answers(yesterday) == ["bar"]
        assert question.get_answers(tomorrow) == ["foo"]
        assert question.get_answers(two_years_after) == ["baz"]


class EventTest(TestCase):
    def test_str(self):
        event = Event(
            title="foo",
            description="foo",
            date=datetime.datetime.now(),
            location="bar"
        )
        assert str(event) == "foo"


class PeopleTest(TestCase):
    def test_str(self):
        people = People(
            name="foo",
        )
        assert str(people) == "foo"
