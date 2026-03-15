from django.contrib import admin
from django.urls import path, include
from django.views.decorators.csrf import csrf_exempt
from graphene_django.views import GraphQLView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/zentinelle/", include("zentinelle.api.urls")),
    path("gql/zentinelle/", csrf_exempt(GraphQLView.as_view(graphiql=True))),
    path("proxy/", include("zentinelle.proxy.urls")),
]
