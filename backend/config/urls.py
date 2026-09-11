from django.contrib import admin
from django.urls import include, path

from zentinelle.api.graphql_view import ZentinelleGraphQLView
from zentinelle.schema import schema

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/zentinelle/v1/", include("zentinelle.api.urls")),
    path("gql/zentinelle", ZentinelleGraphQLView.as_view(schema=schema, graphql_ide="graphiql")),
    path("gql/zentinelle/", ZentinelleGraphQLView.as_view(schema=schema, graphql_ide="graphiql")),
    path("integrations/", include("zentinelle.integrations.urls")),
    path("proxy/", include("zentinelle.proxy.urls")),
]
