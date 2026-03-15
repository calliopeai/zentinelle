"""
GraphQL Schema for System Prompt Library.

Provides queries and mutations for managing reusable prompts
across multiple AI providers.
"""

import graphene
from graphene import relay
from graphene_django import DjangoObjectType
from graphene_django.filter import DjangoFilterConnectionField
from django.db.models import Q

from zentinelle.models.system_prompt import (
    PromptCategory,
    PromptTag,
    SystemPrompt,
    PromptFavorite,
    PromptRating,
)


# =============================================================================
# Types
# =============================================================================

class PromptCategoryType(DjangoObjectType):
    class Meta:
        model = PromptCategory
        fields = [
            'id', 'name', 'slug', 'description', 'icon', 'color',
            'sort_order', 'is_active', 'created_at'
        ]
        interfaces = (relay.Node,)
        filter_fields = {
            'is_active': ['exact'],
            'name': ['icontains'],
        }

    prompt_count = graphene.Int()

    def resolve_prompt_count(self, info):
        return self.prompts.filter(status='active').count()


class PromptTagType(DjangoObjectType):
    class Meta:
        model = PromptTag
        fields = [
            'id', 'name', 'slug', 'tag_type', 'description', 'color',
            'is_active', 'created_at'
        ]
        interfaces = (relay.Node,)
        filter_fields = {
            'tag_type': ['exact'],
            'is_active': ['exact'],
            'name': ['icontains'],
        }

    tag_type_display = graphene.String()

    def resolve_tag_type_display(self, info):
        return self.get_tag_type_display()


class SystemPromptType(DjangoObjectType):
    class Meta:
        model = SystemPrompt
        fields = [
            'id', 'name', 'slug', 'description', 'prompt_text', 'prompt_type',
            'category', 'tags', 'compatible_providers', 'compatible_models',
            'recommended_temperature', 'recommended_max_tokens',
            'template_variables', 'variable_defaults', 'variable_descriptions',
            'example_input', 'example_output', 'example_conversation',
            'use_cases', 'best_practices', 'limitations',
            'version', 'parent_prompt', 'change_log',
            'status', 'visibility', 'is_featured', 'is_verified',
            'usage_count', 'favorite_count', 'fork_count', 'avg_rating',
            'user_id', 'created_at', 'updated_at'
        ]
        interfaces = (relay.Node,)
        filter_fields = {
            'status': ['exact'],
            'visibility': ['exact'],
            'prompt_type': ['exact'],
            'is_featured': ['exact'],
            'is_verified': ['exact'],
            'name': ['icontains'],
        }

    prompt_type_display = graphene.String()
    status_display = graphene.String()
    visibility_display = graphene.String()
    is_favorited = graphene.Boolean()
    user_rating = graphene.Int()
    rendered_preview = graphene.String(variables=graphene.JSONString())
    created_by_username = graphene.String()

    def resolve_prompt_type_display(self, info):
        return self.get_prompt_type_display()

    def resolve_status_display(self, info):
        return self.get_status_display()

    def resolve_visibility_display(self, info):
        return self.get_visibility_display()

    def resolve_is_favorited(self, info):
        user = info.context.user
        if not user or not user.is_authenticated:
            return False
        return PromptFavorite.objects.filter(ext_user_id=str(user.pk), prompt=self).exists()

    def resolve_user_rating(self, info):
        user = info.context.user
        if not user or not user.is_authenticated:
            return None
        rating = PromptRating.objects.filter(ext_user_id=str(user.pk), prompt=self).first()
        return rating.rating if rating else None

    def resolve_rendered_preview(self, info, variables=None):
        return self.render(variables or {})

    def resolve_created_by_username(self, info):
        return self.user_id or None


class PromptFavoriteType(DjangoObjectType):
    class Meta:
        model = PromptFavorite
        fields = ['id', 'ext_user_id', 'prompt', 'created_at']
        interfaces = (relay.Node,)


class PromptRatingType(DjangoObjectType):
    class Meta:
        model = PromptRating
        fields = ['id', 'ext_user_id', 'prompt', 'rating', 'review', 'created_at', 'updated_at']
        interfaces = (relay.Node,)


# =============================================================================
# Queries
# =============================================================================

class PromptLibraryQuery(graphene.ObjectType):
    """Queries for the prompt library."""

    # Categories
    prompt_categories = graphene.List(PromptCategoryType, active_only=graphene.Boolean())
    prompt_category = graphene.Field(PromptCategoryType, id=graphene.UUID(), slug=graphene.String())

    # Tags
    prompt_tags = graphene.List(
        PromptTagType,
        tag_type=graphene.String(),
        active_only=graphene.Boolean()
    )

    # Prompts
    system_prompts = DjangoFilterConnectionField(
        SystemPromptType,
        search=graphene.String(),
        category_slug=graphene.String(),
        system_prompt_type=graphene.String(),
        provider=graphene.String(),
        tag_slugs=graphene.List(graphene.String),
        featured_only=graphene.Boolean(),
        verified_only=graphene.Boolean(),
        favorites_only=graphene.Boolean(),
    )
    system_prompt = graphene.Field(SystemPromptType, id=graphene.UUID(), slug=graphene.String())

    # Featured/Popular
    featured_prompts = graphene.List(SystemPromptType, limit=graphene.Int())
    popular_prompts = graphene.List(SystemPromptType, limit=graphene.Int())

    # User's prompts
    my_prompts = DjangoFilterConnectionField(SystemPromptType)
    my_favorites = DjangoFilterConnectionField(SystemPromptType)

    # Resolvers
    @staticmethod
    def resolve_prompt_categories(root, info, active_only=True):
        qs = PromptCategory.objects.all()
        if active_only:
            qs = qs.filter(is_active=True)
        return qs

    @staticmethod
    def resolve_prompt_category(root, info, id=None, slug=None):
        if id:
            return PromptCategory.objects.filter(id=id).first()
        if slug:
            return PromptCategory.objects.filter(slug=slug).first()
        return None

    @staticmethod
    def resolve_prompt_tags(root, info, tag_type=None, active_only=True):
        qs = PromptTag.objects.all()
        if tag_type:
            qs = qs.filter(tag_type=tag_type)
        if active_only:
            qs = qs.filter(is_active=True)
        return qs

    @staticmethod
    def resolve_system_prompts(
        root, info, search=None, category_slug=None, system_prompt_type=None,
        provider=None, tag_slugs=None, featured_only=False, verified_only=False,
        favorites_only=False, **kwargs
    ):
        user = info.context.user
        qs = SystemPrompt.objects.filter(status='active')

        # Visibility filter
        if user and user.is_authenticated:
            # User can see: public and their own
            qs = qs.filter(
                Q(visibility='public') |
                Q(user_id=str(user.pk))
            )
        else:
            qs = qs.filter(visibility='public')

        # Search
        if search:
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(description__icontains=search) |
                Q(prompt_text__icontains=search)
            )

        # Filters
        if category_slug:
            qs = qs.filter(category__slug=category_slug)
        if system_prompt_type:
            qs = qs.filter(prompt_type=system_prompt_type)
        if provider:
            qs = qs.filter(compatible_providers__contains=[provider])
        if tag_slugs:
            qs = qs.filter(tags__slug__in=tag_slugs).distinct()
        if featured_only:
            qs = qs.filter(is_featured=True)
        if verified_only:
            qs = qs.filter(is_verified=True)
        if favorites_only and user and user.is_authenticated:
            favorite_ids = PromptFavorite.objects.filter(ext_user_id=str(user.pk)).values_list('prompt_id', flat=True)
            qs = qs.filter(id__in=favorite_ids)

        return qs.select_related('category').prefetch_related('tags')

    @staticmethod
    def resolve_system_prompt(root, info, id=None, slug=None):
        if id:
            return SystemPrompt.objects.filter(id=id).first()
        if slug:
            return SystemPrompt.objects.filter(slug=slug, status='active').first()
        return None

    @staticmethod
    def resolve_featured_prompts(root, info, limit=6):
        return SystemPrompt.objects.filter(
            status='active',
            visibility='public',
            is_featured=True
        ).order_by('-created_at')[:limit]

    @staticmethod
    def resolve_popular_prompts(root, info, limit=6):
        return SystemPrompt.objects.filter(
            status='active',
            visibility='public'
        ).order_by('-usage_count', '-favorite_count')[:limit]

    @staticmethod
    def resolve_my_prompts(root, info, **kwargs):
        user = info.context.user
        if not user or not user.is_authenticated:
            return SystemPrompt.objects.none()
        return SystemPrompt.objects.filter(user_id=str(user.pk))

    @staticmethod
    def resolve_my_favorites(root, info, **kwargs):
        user = info.context.user
        if not user or not user.is_authenticated:
            return SystemPrompt.objects.none()
        favorite_ids = PromptFavorite.objects.filter(ext_user_id=str(user.pk)).values_list('prompt_id', flat=True)
        return SystemPrompt.objects.filter(id__in=favorite_ids)


# =============================================================================
# Mutations
# =============================================================================

class CreateSystemPromptInput(graphene.InputObjectType):
    name = graphene.String(required=True)
    description = graphene.String()
    prompt_text = graphene.String(required=True)
    prompt_type = graphene.String()
    category_id = graphene.UUID()
    tag_ids = graphene.List(graphene.UUID)
    compatible_providers = graphene.List(graphene.String)
    compatible_models = graphene.List(graphene.String)
    recommended_temperature = graphene.Float()
    recommended_max_tokens = graphene.Int()
    variable_defaults = graphene.JSONString()
    variable_descriptions = graphene.JSONString()
    example_input = graphene.String()
    example_output = graphene.String()
    use_cases = graphene.List(graphene.String)
    best_practices = graphene.String()
    limitations = graphene.String()
    visibility = graphene.String()


class CreateSystemPrompt(graphene.Mutation):
    class Arguments:
        input = CreateSystemPromptInput(required=True)

    success = graphene.Boolean()
    errors = graphene.List(graphene.String)
    prompt = graphene.Field(SystemPromptType)

    @staticmethod
    def mutate(root, info, input):
        user = info.context.user
        if not user or not user.is_authenticated:
            return CreateSystemPrompt(success=False, errors=['Authentication required'])

        from django.utils.text import slugify

        # Generate slug
        base_slug = slugify(input.name)
        slug = base_slug
        counter = 1
        while SystemPrompt.objects.filter(slug=slug, version=1).exists():
            slug = f"{base_slug}-{counter}"
            counter += 1

        prompt = SystemPrompt(
            name=input.name,
            slug=slug,
            description=input.description or '',
            user_id=str(user.pk),
            prompt_text=input.prompt_text,
            prompt_type=input.prompt_type or 'system',
            compatible_providers=input.compatible_providers or [],
            compatible_models=input.compatible_models or [],
            recommended_temperature=input.recommended_temperature,
            recommended_max_tokens=input.recommended_max_tokens,
            variable_defaults=input.variable_defaults or {},
            variable_descriptions=input.variable_descriptions or {},
            example_input=input.example_input or '',
            example_output=input.example_output or '',
            use_cases=input.use_cases or [],
            best_practices=input.best_practices or '',
            limitations=input.limitations or '',
            visibility=input.visibility or 'private',
            status='draft',
        )

        if input.category_id:
            prompt.category = PromptCategory.objects.filter(id=input.category_id).first()

        prompt.save()

        if input.tag_ids:
            tags = PromptTag.objects.filter(id__in=input.tag_ids)
            prompt.tags.set(tags)

        return CreateSystemPrompt(success=True, prompt=prompt)


class UpdateSystemPromptInput(graphene.InputObjectType):
    name = graphene.String()
    description = graphene.String()
    prompt_text = graphene.String()
    prompt_type = graphene.String()
    category_id = graphene.UUID()
    tag_ids = graphene.List(graphene.UUID)
    compatible_providers = graphene.List(graphene.String)
    compatible_models = graphene.List(graphene.String)
    recommended_temperature = graphene.Float()
    recommended_max_tokens = graphene.Int()
    variable_defaults = graphene.JSONString()
    variable_descriptions = graphene.JSONString()
    example_input = graphene.String()
    example_output = graphene.String()
    use_cases = graphene.List(graphene.String)
    best_practices = graphene.String()
    limitations = graphene.String()
    visibility = graphene.String()
    status = graphene.String()


class UpdateSystemPrompt(graphene.Mutation):
    class Arguments:
        id = graphene.UUID(required=True)
        input = UpdateSystemPromptInput(required=True)

    success = graphene.Boolean()
    errors = graphene.List(graphene.String)
    prompt = graphene.Field(SystemPromptType)

    @staticmethod
    def mutate(root, info, id, input):
        user = info.context.user
        if not user or not user.is_authenticated:
            return UpdateSystemPrompt(success=False, errors=['Authentication required'])

        prompt = SystemPrompt.objects.filter(id=id).first()
        if not prompt:
            return UpdateSystemPrompt(success=False, errors=['Prompt not found'])

        # Check ownership
        if prompt.user_id != str(user.pk) and not user.is_superuser:
            return UpdateSystemPrompt(success=False, errors=['Permission denied'])

        # Update fields
        for field in [
            'name', 'description', 'prompt_text', 'prompt_type',
            'compatible_providers', 'compatible_models',
            'recommended_temperature', 'recommended_max_tokens',
            'variable_defaults', 'variable_descriptions',
            'example_input', 'example_output', 'use_cases',
            'best_practices', 'limitations', 'visibility', 'status'
        ]:
            value = getattr(input, field, None)
            if value is not None:
                setattr(prompt, field, value)

        if input.category_id:
            prompt.category = PromptCategory.objects.filter(id=input.category_id).first()

        prompt.save()

        if input.tag_ids is not None:
            tags = PromptTag.objects.filter(id__in=input.tag_ids)
            prompt.tags.set(tags)

        return UpdateSystemPrompt(success=True, prompt=prompt)


class DeleteSystemPrompt(graphene.Mutation):
    class Arguments:
        id = graphene.UUID(required=True)

    success = graphene.Boolean()
    errors = graphene.List(graphene.String)

    @staticmethod
    def mutate(root, info, id):
        user = info.context.user
        if not user or not user.is_authenticated:
            return DeleteSystemPrompt(success=False, errors=['Authentication required'])

        prompt = SystemPrompt.objects.filter(id=id).first()
        if not prompt:
            return DeleteSystemPrompt(success=False, errors=['Prompt not found'])

        if prompt.user_id != str(user.pk) and not user.is_superuser:
            return DeleteSystemPrompt(success=False, errors=['Permission denied'])

        prompt.delete()
        return DeleteSystemPrompt(success=True)


class ForkSystemPrompt(graphene.Mutation):
    class Arguments:
        id = graphene.UUID(required=True)

    success = graphene.Boolean()
    errors = graphene.List(graphene.String)
    prompt = graphene.Field(SystemPromptType)

    @staticmethod
    def mutate(root, info, id):
        user = info.context.user
        if not user or not user.is_authenticated:
            return ForkSystemPrompt(success=False, errors=['Authentication required'])

        prompt = SystemPrompt.objects.filter(id=id).first()
        if not prompt:
            return ForkSystemPrompt(success=False, errors=['Prompt not found'])

        forked = prompt.fork(user_id=str(user.pk))
        return ForkSystemPrompt(success=True, prompt=forked)


class TogglePromptFavorite(graphene.Mutation):
    class Arguments:
        prompt_id = graphene.UUID(required=True)

    success = graphene.Boolean()
    is_favorited = graphene.Boolean()

    @staticmethod
    def mutate(root, info, prompt_id):
        user = info.context.user
        if not user or not user.is_authenticated:
            return TogglePromptFavorite(success=False, is_favorited=False)

        prompt = SystemPrompt.objects.filter(id=prompt_id).first()
        if not prompt:
            return TogglePromptFavorite(success=False, is_favorited=False)

        favorite = PromptFavorite.objects.filter(ext_user_id=str(user.pk), prompt=prompt).first()
        if favorite:
            favorite.delete()
            return TogglePromptFavorite(success=True, is_favorited=False)
        else:
            PromptFavorite.objects.create(ext_user_id=str(user.pk), prompt=prompt)
            return TogglePromptFavorite(success=True, is_favorited=True)


class RateSystemPrompt(graphene.Mutation):
    class Arguments:
        prompt_id = graphene.UUID(required=True)
        rating = graphene.Int(required=True)
        review = graphene.String()

    success = graphene.Boolean()
    errors = graphene.List(graphene.String)
    rating_obj = graphene.Field(PromptRatingType)

    @staticmethod
    def mutate(root, info, prompt_id, rating, review=None):
        user = info.context.user
        if not user or not user.is_authenticated:
            return RateSystemPrompt(success=False, errors=['Authentication required'])

        if rating < 1 or rating > 5:
            return RateSystemPrompt(success=False, errors=['Rating must be 1-5'])

        prompt = SystemPrompt.objects.filter(id=prompt_id).first()
        if not prompt:
            return RateSystemPrompt(success=False, errors=['Prompt not found'])

        rating_obj, _ = PromptRating.objects.update_or_create(
            ext_user_id=str(user.pk),
            prompt=prompt,
            defaults={'rating': rating, 'review': review or ''}
        )
        return RateSystemPrompt(success=True, rating_obj=rating_obj)


class TestSystemPrompt(graphene.Mutation):
    """
    Test a prompt with a sample message using AI.

    LIMITS:
    - Max 20 tests per hour
    - Prompt: 8000 chars max
    - Test input: 500 chars max
    - Response: ~512 tokens
    """

    class Arguments:
        system_prompt = graphene.String(required=True)
        user_message = graphene.String(required=True)

    success = graphene.Boolean()
    response = graphene.String()
    model_used = graphene.String()
    input_tokens = graphene.Int()
    output_tokens = graphene.Int()
    error = graphene.String()

    @staticmethod
    def mutate(root, info, system_prompt, user_message):
        user = info.context.user
        if not user or not user.is_authenticated:
            return TestSystemPrompt(
                success=False, response='', model_used='', input_tokens=0,
                output_tokens=0, error='Authentication required'
            )

        from zentinelle.services.prompt_tester import test_prompt_sync

        result = test_prompt_sync(
            system_prompt=system_prompt,
            user_message=user_message,
            user_id=str(user.id),
        )

        return TestSystemPrompt(
            success=result.success,
            response=result.response,
            model_used=result.model_used,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            error=result.error,
        )


class ImprovementSuggestionType(graphene.ObjectType):
    """A suggested improvement to a prompt."""
    category = graphene.String()
    original_text = graphene.String()
    suggested_text = graphene.String()
    explanation = graphene.String()
    severity = graphene.String()


class AnalyzeSystemPrompt(graphene.Mutation):
    """
    Analyze a prompt and get AI-powered improvement suggestions.

    LIMITS:
    - Max 10 analyses per hour
    - Prompt: 8000 chars max
    """

    class Arguments:
        prompt_text = graphene.String(required=True)
        prompt_type = graphene.String()
        target_providers = graphene.List(graphene.String)

    success = graphene.Boolean()
    overall_score = graphene.Int()
    strengths = graphene.List(graphene.String)
    improvements = graphene.List(ImprovementSuggestionType)
    token_efficiency = graphene.String()
    error = graphene.String()

    @staticmethod
    def mutate(root, info, prompt_text, prompt_type='system', target_providers=None):
        user = info.context.user
        if not user or not user.is_authenticated:
            return AnalyzeSystemPrompt(
                success=False, overall_score=0, strengths=[], improvements=[],
                token_efficiency='', error='Authentication required'
            )

        from zentinelle.services.prompt_tester import analyze_prompt_sync

        result = analyze_prompt_sync(
            prompt_text=prompt_text,
            user_id=str(user.id),
            prompt_type=prompt_type,
            target_providers=target_providers,
        )

        improvements = [
            ImprovementSuggestionType(
                category=imp.category,
                original_text=imp.original_text,
                suggested_text=imp.suggested_text,
                explanation=imp.explanation,
                severity=imp.severity,
            )
            for imp in result.improvements
        ]

        return AnalyzeSystemPrompt(
            success=result.success,
            overall_score=result.overall_score,
            strengths=result.strengths,
            improvements=improvements,
            token_efficiency=result.token_efficiency,
            error=result.error,
        )


class PromptLibraryMutation(graphene.ObjectType):
    """Mutations for the prompt library."""
    create_system_prompt = CreateSystemPrompt.Field()
    update_system_prompt = UpdateSystemPrompt.Field()
    delete_system_prompt = DeleteSystemPrompt.Field()
    fork_system_prompt = ForkSystemPrompt.Field()
    toggle_prompt_favorite = TogglePromptFavorite.Field()
    rate_system_prompt = RateSystemPrompt.Field()
    test_system_prompt = TestSystemPrompt.Field()
    analyze_system_prompt = AnalyzeSystemPrompt.Field()
