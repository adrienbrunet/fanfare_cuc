from django.contrib.admin import *


class MyAdminSite(AdminSite):
    # Text to put at the end of each page's <title>.
    site_title = 'CUC admin'

    # Text to put in each page's <h1> (and above login form).
    site_header = 'CUC - Administration Zone'

    # Text to put at the top of the admin index page.
    index_title = 'Admin'
