from datetime import datetime

from django.core.urlresolvers import reverse
from django.test import TestCase

from ..models import QuestionPage


class StaticPageTest(TestCase):

    def test_landing_page(self):
        response = self.client.get('')
        assert response.status_code == 200
        assert 'landing_page.html' in [t.name for t in response.templates]

    def test_presentation(self):
        response = self.client.get(reverse('presentation'))
        assert response.status_code == 200
        assert 'presentation.html' in [t.name for t in response.templates]

    def test_question(self):
        now = datetime.now()
        question = QuestionPage.objects.create(
            slug="hard-test",
            start_date=now,
            end_date=now,
            answers=["foo"],
            answers_before=["bar"],
            answers_expired=["baz"])
        url = reverse('question', kwargs={"slug": question.slug})
        response = self.client.get(url)
        assert response.status_code == 200
        assert "answer" in response.context
        assert 'question_page.html' in [t.name for t in response.templates]
