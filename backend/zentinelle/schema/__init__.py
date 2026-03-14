"""
GraphQL schema for Zentinelle standalone.

# TODO: decouple - full schema (types, queries, mutations) depends on
# client-cove models (Deployment, JunoHubConfig, etc.). The raw files
# are preserved in this directory for future reference. This stub
# provides a minimal health-check schema so Django/Graphene boots cleanly.
"""
import graphene


class Query(graphene.ObjectType):
    health = graphene.String(description="Health check")

    def resolve_health(root, info):
        return "ok"


class Mutation(graphene.ObjectType):
    pass


schema = graphene.Schema(query=Query)
