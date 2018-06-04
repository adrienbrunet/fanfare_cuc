import os, sys
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "CUC.settings")

sys.path.insert(1, os.path.dirname(os.path.realpath(__file__)))

from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()
