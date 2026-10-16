from django.conf import settings
from django.contrib import admin
from django.urls import include, path

from zentinelle.api.graphql_view import ZentinelleGraphQLView
from zentinelle.schema import schema

# The in-browser IDE only while debugging: in production it is a ready-made
# query console for anyone who reaches the URL.
_graphql_ide = "graphiql" if settings.DEBUG else None

urlpatterns = [
    path("api/zentinelle/v1/", include("zentinelle.api.urls")),
    path("gql/zentinelle", ZentinelleGraphQLView.as_view(schema=schema, graphql_ide=_graphql_ide)),
    path("gql/zentinelle/", ZentinelleGraphQLView.as_view(schema=schema, graphql_ide=_graphql_ide)),
    path("integrations/", include("zentinelle.integrations.urls")),
    path("proxy/", include("zentinelle.proxy.urls")),
]

if settings.ENABLE_DJANGO_ADMIN:
    urlpatterns.append(path("admin/", admin.site.urls))
