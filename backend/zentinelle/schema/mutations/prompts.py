"""
System Prompt Library mutations.

All write operations are tenant-scoped via tenant_id. In standalone mode
there are no user accounts, so ext_user_id is set to the tenant_id for
favorites/ratings (one "user" per tenant).
"""
import re
import uuid
from typing import Optional

import strawberry

from zentinelle.models.system_prompt import (PromptFavorite, PromptRating,
                                             SystemPrompt)
from zentinelle.schema.auth_helpers import require_request_tenant_id
from zentinelle.schema.types import SystemPromptType


def _extract_variables(text: str) -> list[str]:
    """Extract {{variable}} placeholders from prompt text."""
    return list(dict.fromkeys(re.findall(r'\{\{(\w+)\}\}', text)))


def _tenant_id(info) -> str:
    return require_request_tenant_id(info.context.request.user)


@strawberry.input
class UpdateSystemPromptInput:
    name: Optional[str] = None
    description: Optional[str] = None
    prompt_text: Optional[str] = None
    prompt_type: Optional[str] = None
    visibility: Optional[str] = None
    category_id: Optional[uuid.UUID] = None
    tag_ids: Optional[list[uuid.UUID]] = None
    compatible_providers: Optional[list[str]] = None
    compatible_models: Optional[list[str]] = None
    recommended_temperature: Optional[float] = None
    recommended_max_tokens: Optional[int] = None
    example_input: Optional[str] = None
    example_output: Optional[str] = None
    use_cases: Optional[list[str]] = None
    best_practices: Optional[str] = None


@strawberry.type
class SystemPromptPayload:
    prompt: Optional[SystemPromptType] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class TogglePromptFavoritePayload:
    is_favorited: Optional[bool] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class RatePromptPayload:
    avg_rating: Optional[float] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class DeletePromptPayload:
    success: Optional[bool] = None
    errors: list[str] = strawberry.field(default_factory=list)


def update_system_prompt(info: strawberry.types.Info, id: uuid.UUID, input: UpdateSystemPromptInput) -> SystemPromptPayload:
    from zentinelle.models.system_prompt import PromptCategory, PromptTag

    tenant_id = _tenant_id(info)

    try:
        prompt = SystemPrompt.objects.get(id=id, tenant_id=tenant_id)
    except SystemPrompt.DoesNotExist:
        return SystemPromptPayload(prompt=None, errors=['Prompt not found'])

    updatable = ['name', 'description', 'prompt_type', 'visibility',
                 'recommended_temperature', 'recommended_max_tokens',
                 'example_input', 'example_output', 'best_practices']

    for field in updatable:
        val = getattr(input, field, None)
        if val is not None:
            setattr(prompt, field, val)

    if input.prompt_text is not None:
        prompt.prompt_text = input.prompt_text
        prompt.template_variables = _extract_variables(input.prompt_text)

    if input.compatible_providers is not None:
        prompt.compatible_providers = list(input.compatible_providers)

    if input.compatible_models is not None:
        prompt.compatible_models = list(input.compatible_models)

    if input.use_cases is not None:
        prompt.use_cases = list(input.use_cases)

    if input.category_id is not None:
        try:
            prompt.category = PromptCategory.objects.get(id=input.category_id)
        except PromptCategory.DoesNotExist:
            prompt.category = None

    prompt.save()

    if input.tag_ids is not None:
        tags = PromptTag.objects.filter(id__in=input.tag_ids)
        prompt.tags.set(tags)

    return SystemPromptPayload(prompt=prompt, errors=[])


def delete_system_prompt(info: strawberry.types.Info, id: uuid.UUID) -> DeletePromptPayload:
    tenant_id = _tenant_id(info)
    try:
        prompt = SystemPrompt.objects.get(id=id, tenant_id=tenant_id)
        prompt.delete()
        return DeletePromptPayload(success=True, errors=[])
    except SystemPrompt.DoesNotExist:
        return DeletePromptPayload(success=False, errors=['Prompt not found'])


def toggle_prompt_favorite(info: strawberry.types.Info, prompt_id: uuid.UUID) -> TogglePromptFavoritePayload:
    tenant_id = _tenant_id(info)

    try:
        prompt = SystemPrompt.objects.get(id=prompt_id)
    except SystemPrompt.DoesNotExist:
        return TogglePromptFavoritePayload(is_favorited=False, errors=['Prompt not found'])

    existing = PromptFavorite.objects.filter(
        ext_user_id=tenant_id,
        prompt=prompt,
    ).first()

    if existing:
        existing.delete()
        return TogglePromptFavoritePayload(is_favorited=False, errors=[])
    else:
        PromptFavorite.objects.create(ext_user_id=tenant_id, prompt=prompt)
        return TogglePromptFavoritePayload(is_favorited=True, errors=[])


def rate_system_prompt(info: strawberry.types.Info, prompt_id: uuid.UUID, rating: int, review: Optional[str] = None) -> RatePromptPayload:
    tenant_id = _tenant_id(info)

    if not 1 <= rating <= 5:
        return RatePromptPayload(avg_rating=None, errors=['Rating must be 1-5'])

    try:
        prompt = SystemPrompt.objects.get(id=prompt_id)
    except SystemPrompt.DoesNotExist:
        return RatePromptPayload(avg_rating=None, errors=['Prompt not found'])

    obj, created = PromptRating.objects.update_or_create(
        ext_user_id=tenant_id,
        prompt=prompt,
        defaults={'rating': rating, 'review': review or ''},
    )

    prompt.refresh_from_db(fields=['avg_rating'])
    return RatePromptPayload(avg_rating=prompt.avg_rating, errors=[])
