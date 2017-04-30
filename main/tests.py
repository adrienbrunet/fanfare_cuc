from django.test import TestCase

from django.core.urlresolvers import reverse


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
        response = self.client.get(reverse('puligny'))
        assert response.status_code == 200
        assert 'puligny.html' in [t.name for t in response.templates]
