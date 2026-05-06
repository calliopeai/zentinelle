from django.contrib import admin
from django.urls import path, include
from django.views.decorators.csrf import csrf_exempt
from zentinelle.api.graphql_view import ZentinelleGraphQLView
from zentinelle.schema import schema

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/zentinelle/v1/", include("zentinelle.api.urls")),
    path("gql/zentinelle/", csrf_exempt(ZentinelleGraphQLView.as_view(schema=schema, graphql_ide="graphiql"))),
    path("proxy/", include("zentinelle.proxy.urls")),
]
