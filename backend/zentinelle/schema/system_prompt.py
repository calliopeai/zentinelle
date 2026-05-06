"""
GraphQL Schema for System Prompt Library.

Provides queries and mutations for managing reusable prompts
across multiple AI providers.
"""
import uuid
from typing import Optional

import strawberry
import strawberry_django
from django.db.models import Q
from strawberry import auto
from strawberry.scalars import JSON

from zentinelle.models.system_prompt import (PromptCategory, PromptFavorite,
                                             PromptRating, PromptTag,
                                             SystemPrompt)

# =============================================================================
# Types
# =============================================================================

@strawberry_django.type(PromptCategory)
class PromptCategoryDjangoType:
    id: auto
    name: auto
    slug: auto
    description: auto
    icon: auto
    color: auto
    sort_order: auto
    is_active: auto
    created_at: auto

    @strawberry.field
    def prompt_count(self) -> int:
        return self.prompts.filter(status='active').count()


@strawberry_django.type(PromptTag)
class PromptTagDjangoType:
    id: auto
    name: auto
    slug: auto
    tag_type: auto
    description: auto
    color: auto
    is_active: auto
    created_at: auto

    @strawberry.field
    def tag_type_display(self) -> str:
        return self.get_tag_type_display()


@strawberry_django.type(SystemPrompt)
class SystemPromptDjangoType:
    id: auto
    name: auto
    slug: auto
    description: auto
    prompt_text: auto
    prompt_type: auto
    category: Optional[PromptCategoryDjangoType]
    compatible_providers: auto
    compatible_models: auto
    recommended_temperature: auto
    recommended_max_tokens: auto
    template_variables: auto
    variable_defaults: auto
    variable_descriptions: auto
    example_input: auto
    example_output: auto
    example_conversation: auto
    use_cases: auto
    best_practices: auto
    limitations: auto
    version: auto
    parent_prompt: Optional['SystemPromptDjangoType']
    change_log: auto
    status: auto
    visibility: auto
    is_featured: auto
    is_verified: auto
    usage_count: auto
    favorite_count: auto
    fork_count: auto
    avg_rating: auto
    user_id: auto
    created_at: auto
    updated_at: auto

    @strawberry.field
    def tags(self) -> list[PromptTagDjangoType]:
        return self.tags.all()

    @strawberry.field
    def prompt_type_display(self) -> str:
        return self.get_prompt_type_display()

    @strawberry.field
    def status_display(self) -> str:
        return self.get_status_display()

    @strawberry.field
    def visibility_display(self) -> str:
        return self.get_visibility_display()

    @strawberry.field
    def is_favorited(self, info: strawberry.types.Info) -> bool:
        user = info.context.request.user
        if not user or not user.is_authenticated:
            return False
        return PromptFavorite.objects.filter(ext_user_id=str(user.pk), prompt=self).exists()

    @strawberry.field
    def user_rating(self, info: strawberry.types.Info) -> Optional[int]:
        user = info.context.request.user
        if not user or not user.is_authenticated:
            return None
        rating = PromptRating.objects.filter(ext_user_id=str(user.pk), prompt=self).first()
        return rating.rating if rating else None

    @strawberry.field
    def rendered_preview(self, variables: Optional[JSON] = None) -> Optional[str]:
        return self.render(variables or {})

    @strawberry.field
    def created_by_username(self) -> Optional[str]:
        return self.user_id or None


@strawberry_django.type(PromptFavorite)
class PromptFavoriteDjangoType:
    id: auto
    ext_user_id: auto
    prompt: SystemPromptDjangoType
    created_at: auto


@strawberry_django.type(PromptRating)
class PromptRatingDjangoType:
    id: auto
    ext_user_id: auto
    prompt: SystemPromptDjangoType
    rating: auto
    review: auto
    created_at: auto
    updated_at: auto


# =============================================================================
# Queries
# =============================================================================

@strawberry.type
class PromptLibraryQuery:
    """Queries for the prompt library."""

    @strawberry.field
    def prompt_categories(self, info: strawberry.types.Info, active_only: bool = True) -> list[PromptCategoryDjangoType]:
        qs = PromptCategory.objects.all()
        if active_only:
            qs = qs.filter(is_active=True)
        return qs

    @strawberry.field
    def prompt_category(
        self,
        info: strawberry.types.Info,
        id: Optional[uuid.UUID] = None,
        slug: Optional[str] = None,
    ) -> Optional[PromptCategoryDjangoType]:
        if id:
            return PromptCategory.objects.filter(id=id).first()
        if slug:
            return PromptCategory.objects.filter(slug=slug).first()
        return None

    @strawberry.field
    def prompt_tags(
        self,
        info: strawberry.types.Info,
        tag_type: Optional[str] = None,
        active_only: bool = True,
    ) -> list[PromptTagDjangoType]:
        qs = PromptTag.objects.all()
        if tag_type:
            qs = qs.filter(tag_type=tag_type)
        if active_only:
            qs = qs.filter(is_active=True)
        return qs

    @strawberry.field
    def system_prompts(
        self,
        info: strawberry.types.Info,
        search: Optional[str] = None,
        category_slug: Optional[str] = None,
        system_prompt_type: Optional[str] = None,
        provider: Optional[str] = None,
        tag_slugs: Optional[list[str]] = None,
        featured_only: bool = False,
        verified_only: bool = False,
        favorites_only: bool = False,
    ) -> list[SystemPromptDjangoType]:
        user = info.context.request.user
        qs = SystemPrompt.objects.filter(status='active')

        if user and user.is_authenticated:
            qs = qs.filter(
                Q(visibility='public') |
                Q(user_id=str(user.pk))
            )
        else:
            qs = qs.filter(visibility='public')

        if search:
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(description__icontains=search) |
                Q(prompt_text__icontains=search)
            )

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
            favorite_ids = PromptFavorite.objects.filter(
                ext_user_id=str(user.pk)
            ).values_list('prompt_id', flat=True)
            qs = qs.filter(id__in=favorite_ids)

        return qs.select_related('category').prefetch_related('tags')

    @strawberry.field
    def system_prompt(
        self,
        info: strawberry.types.Info,
        id: Optional[uuid.UUID] = None,
        slug: Optional[str] = None,
    ) -> Optional[SystemPromptDjangoType]:
        if id:
            return SystemPrompt.objects.filter(id=id).first()
        if slug:
            return SystemPrompt.objects.filter(slug=slug, status='active').first()
        return None

    @strawberry.field
    def featured_prompts(self, info: strawberry.types.Info, limit: int = 6) -> list[SystemPromptDjangoType]:
        return SystemPrompt.objects.filter(
            status='active',
            visibility='public',
            is_featured=True
        ).order_by('-created_at')[:limit]

    @strawberry.field
    def popular_prompts(self, info: strawberry.types.Info, limit: int = 6) -> list[SystemPromptDjangoType]:
        return SystemPrompt.objects.filter(
            status='active',
            visibility='public'
        ).order_by('-usage_count', '-favorite_count')[:limit]

    @strawberry.field
    def my_prompts(self, info: strawberry.types.Info) -> list[SystemPromptDjangoType]:
        user = info.context.request.user
        if not user or not user.is_authenticated:
            return SystemPrompt.objects.none()
        return SystemPrompt.objects.filter(user_id=str(user.pk))

    @strawberry.field
    def my_favorites(self, info: strawberry.types.Info) -> list[SystemPromptDjangoType]:
        user = info.context.request.user
        if not user or not user.is_authenticated:
            return SystemPrompt.objects.none()
        favorite_ids = PromptFavorite.objects.filter(
            ext_user_id=str(user.pk)
        ).values_list('prompt_id', flat=True)
        return SystemPrompt.objects.filter(id__in=favorite_ids)


# =============================================================================
# Mutations
# =============================================================================

@strawberry.input
class CreateSystemPromptInput:
    name: str
    prompt_text: str
    description: Optional[str] = None
    prompt_type: Optional[str] = None
    category_id: Optional[uuid.UUID] = None
    tag_ids: Optional[list[uuid.UUID]] = None
    compatible_providers: Optional[list[str]] = None
    compatible_models: Optional[list[str]] = None
    recommended_temperature: Optional[float] = None
    recommended_max_tokens: Optional[int] = None
    variable_defaults: Optional[JSON] = None
    variable_descriptions: Optional[JSON] = None
    example_input: Optional[str] = None
    example_output: Optional[str] = None
    use_cases: Optional[list[str]] = None
    best_practices: Optional[str] = None
    limitations: Optional[str] = None
    visibility: Optional[str] = None


@strawberry.input
class UpdateSystemPromptInput:
    name: Optional[str] = None
    description: Optional[str] = None
    prompt_text: Optional[str] = None
    prompt_type: Optional[str] = None
    category_id: Optional[uuid.UUID] = None
    tag_ids: Optional[list[uuid.UUID]] = None
    compatible_providers: Optional[list[str]] = None
    compatible_models: Optional[list[str]] = None
    recommended_temperature: Optional[float] = None
    recommended_max_tokens: Optional[int] = None
    variable_defaults: Optional[JSON] = None
    variable_descriptions: Optional[JSON] = None
    example_input: Optional[str] = None
    example_output: Optional[str] = None
    use_cases: Optional[list[str]] = None
    best_practices: Optional[str] = None
    limitations: Optional[str] = None
    visibility: Optional[str] = None
    status: Optional[str] = None


@strawberry.type
class CreateSystemPromptPayload:
    success: bool
    errors: list[str] = strawberry.field(default_factory=list)
    prompt: Optional[SystemPromptDjangoType] = None


@strawberry.type
class UpdateSystemPromptPayload:
    success: bool
    errors: list[str] = strawberry.field(default_factory=list)
    prompt: Optional[SystemPromptDjangoType] = None


@strawberry.type
class DeleteSystemPromptPayload:
    success: bool
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class ForkSystemPromptPayload:
    success: bool
    errors: list[str] = strawberry.field(default_factory=list)
    prompt: Optional[SystemPromptDjangoType] = None


@strawberry.type
class TogglePromptFavoritePayload:
    success: bool
    is_favorited: bool = False


@strawberry.type
class RateSystemPromptPayload:
    success: bool
    errors: list[str] = strawberry.field(default_factory=list)
    rating_obj: Optional[PromptRatingDjangoType] = None


@strawberry.type
class TestSystemPromptPayload:
    success: bool
    response: str = ''
    model_used: str = ''
    input_tokens: int = 0
    output_tokens: int = 0
    error: Optional[str] = None


@strawberry.type
class ImprovementSuggestionType:
    category: Optional[str] = None
    original_text: Optional[str] = None
    suggested_text: Optional[str] = None
    explanation: Optional[str] = None
    severity: Optional[str] = None


@strawberry.type
class AnalyzeSystemPromptPayload:
    success: bool
    overall_score: int = 0
    strengths: list[str] = strawberry.field(default_factory=list)
    improvements: list[ImprovementSuggestionType] = strawberry.field(default_factory=list)
    token_efficiency: str = ''
    error: Optional[str] = None


def create_system_prompt(info: strawberry.types.Info, input: CreateSystemPromptInput) -> CreateSystemPromptPayload:
    user = info.context.request.user
    if not user or not user.is_authenticated:
        return CreateSystemPromptPayload(success=False, errors=['Authentication required'])

    from django.utils.text import slugify

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

    return CreateSystemPromptPayload(success=True, prompt=prompt)


def update_system_prompt(info: strawberry.types.Info, id: uuid.UUID, input: UpdateSystemPromptInput) -> UpdateSystemPromptPayload:
    user = info.context.request.user
    if not user or not user.is_authenticated:
        return UpdateSystemPromptPayload(success=False, errors=['Authentication required'])

    prompt = SystemPrompt.objects.filter(id=id).first()
    if not prompt:
        return UpdateSystemPromptPayload(success=False, errors=['Prompt not found'])

    if prompt.user_id != str(user.pk) and not user.is_superuser:
        return UpdateSystemPromptPayload(success=False, errors=['Permission denied'])

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

    return UpdateSystemPromptPayload(success=True, prompt=prompt)


def delete_system_prompt(info: strawberry.types.Info, id: uuid.UUID) -> DeleteSystemPromptPayload:
    user = info.context.request.user
    if not user or not user.is_authenticated:
        return DeleteSystemPromptPayload(success=False, errors=['Authentication required'])

    prompt = SystemPrompt.objects.filter(id=id).first()
    if not prompt:
        return DeleteSystemPromptPayload(success=False, errors=['Prompt not found'])

    if prompt.user_id != str(user.pk) and not user.is_superuser:
        return DeleteSystemPromptPayload(success=False, errors=['Permission denied'])

    prompt.delete()
    return DeleteSystemPromptPayload(success=True)


def fork_system_prompt(info: strawberry.types.Info, id: uuid.UUID) -> ForkSystemPromptPayload:
    user = info.context.request.user
    if not user or not user.is_authenticated:
        return ForkSystemPromptPayload(success=False, errors=['Authentication required'])

    prompt = SystemPrompt.objects.filter(id=id).first()
    if not prompt:
        return ForkSystemPromptPayload(success=False, errors=['Prompt not found'])

    forked = prompt.fork(user_id=str(user.pk))
    return ForkSystemPromptPayload(success=True, prompt=forked)


def toggle_prompt_favorite(info: strawberry.types.Info, prompt_id: uuid.UUID) -> TogglePromptFavoritePayload:
    user = info.context.request.user
    if not user or not user.is_authenticated:
        return TogglePromptFavoritePayload(success=False, is_favorited=False)

    prompt = SystemPrompt.objects.filter(id=prompt_id).first()
    if not prompt:
        return TogglePromptFavoritePayload(success=False, is_favorited=False)

    favorite = PromptFavorite.objects.filter(ext_user_id=str(user.pk), prompt=prompt).first()
    if favorite:
        favorite.delete()
        return TogglePromptFavoritePayload(success=True, is_favorited=False)
    else:
        PromptFavorite.objects.create(ext_user_id=str(user.pk), prompt=prompt)
        return TogglePromptFavoritePayload(success=True, is_favorited=True)


def rate_system_prompt(info: strawberry.types.Info, prompt_id: uuid.UUID, rating: int, review: Optional[str] = None) -> RateSystemPromptPayload:
    user = info.context.request.user
    if not user or not user.is_authenticated:
        return RateSystemPromptPayload(success=False, errors=['Authentication required'])

    if rating < 1 or rating > 5:
        return RateSystemPromptPayload(success=False, errors=['Rating must be 1-5'])

    prompt = SystemPrompt.objects.filter(id=prompt_id).first()
    if not prompt:
        return RateSystemPromptPayload(success=False, errors=['Prompt not found'])

    rating_obj, _ = PromptRating.objects.update_or_create(
        ext_user_id=str(user.pk),
        prompt=prompt,
        defaults={'rating': rating, 'review': review or ''}
    )
    return RateSystemPromptPayload(success=True, rating_obj=rating_obj)


def test_system_prompt(info: strawberry.types.Info, system_prompt: str, user_message: str) -> TestSystemPromptPayload:
    user = info.context.request.user
    if not user or not user.is_authenticated:
        return TestSystemPromptPayload(
            success=False, response='', model_used='', input_tokens=0,
            output_tokens=0, error='Authentication required'
        )

    from zentinelle.services.prompt_tester import test_prompt_sync

    result = test_prompt_sync(
        system_prompt=system_prompt,
        user_message=user_message,
        user_id=str(user.id),
    )

    return TestSystemPromptPayload(
        success=result.success,
        response=result.response,
        model_used=result.model_used,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        error=result.error,
    )


def analyze_system_prompt(
    info: strawberry.types.Info,
    prompt_text: str,
    prompt_type: str = 'system',
    target_providers: Optional[list[str]] = None,
) -> AnalyzeSystemPromptPayload:
    user = info.context.request.user
    if not user or not user.is_authenticated:
        return AnalyzeSystemPromptPayload(
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

    return AnalyzeSystemPromptPayload(
        success=result.success,
        overall_score=result.overall_score,
        strengths=result.strengths,
        improvements=improvements,
        token_efficiency=result.token_efficiency,
        error=result.error,
    )
