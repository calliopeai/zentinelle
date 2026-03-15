"""
GraphQL schema for Zentinelle standalone.

Composes the full schema from queries, mutations, and the prompt library.
"""
import graphene

from .queries import Query as ZentinelleQuery
from .mutations import Mutation as ZentinelleMutation
from .system_prompt import PromptLibraryQuery, PromptLibraryMutation


class Query(ZentinelleQuery, PromptLibraryQuery, graphene.ObjectType):
    pass


class Mutation(ZentinelleMutation, PromptLibraryMutation, graphene.ObjectType):
    pass


schema = graphene.Schema(query=Query, mutation=Mutation)
