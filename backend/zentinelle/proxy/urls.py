from django.urls import re_path
from zentinelle.proxy.views import ProxyView

urlpatterns = [
    re_path(r'^(?P<provider>[^/]+)/(?P<path>.*)$', ProxyView.as_view()),
]
