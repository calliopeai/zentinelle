import graphene

# Schema will be populated during extraction.
# For now, provide a minimal valid schema so Django can boot.


class Query(graphene.ObjectType):
    health = graphene.String(description="Health check")

    def resolve_health(root, info):
        return "ok"


schema = graphene.Schema(query=Query)
