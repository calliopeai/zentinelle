"""
System Prompt Library mutations.

All write operations are tenant-scoped via tenant_id. In standalone mode
there are no user accounts, so ext_user_id is set to the tenant_id for
favorites/ratings (one "user" per tenant).
"""
import re
import graphene
from graphene import relay

from zentinelle.models.system_prompt import SystemPrompt, PromptFavorite, PromptRating
from zentinelle.schema.auth_helpers import get_request_tenant_id


def _extract_variables(text: str) -> list[str]:
    """Extract {{variable}} placeholders from prompt text."""
    return list(dict.fromkeys(re.findall(r'\{\{(\w+)\}\}', text)))


def _tenant_id(info) -> str:
    return get_request_tenant_id(info.context.user) or 'default'


# ---------------------------------------------------------------------------
# Input types
# ---------------------------------------------------------------------------

class CreateSystemPromptInput(graphene.InputObjectType):
    name = graphene.String(required=True)
    description = graphene.String()
    prompt_text = graphene.String(required=True)
    prompt_type = graphene.String()
    visibility = graphene.String()
    category_id = graphene.UUID()
    tag_ids = graphene.List(graphene.UUID)
    compatible_providers = graphene.List(graphene.String)
    compatible_models = graphene.List(graphene.String)
    recommended_temperature = graphene.Float()
    recommended_max_tokens = graphene.Int()
    example_input = graphene.String()
    example_output = graphene.String()
    use_cases = graphene.List(graphene.String)
    best_practices = graphene.String()


class UpdateSystemPromptInput(graphene.InputObjectType):
    name = graphene.String()
    description = graphene.String()
    prompt_text = graphene.String()
    prompt_type = graphene.String()
    visibility = graphene.String()
    category_id = graphene.UUID()
    tag_ids = graphene.List(graphene.UUID)
    compatible_providers = graphene.List(graphene.String)
    compatible_models = graphene.List(graphene.String)
    recommended_temperature = graphene.Float()
    recommended_max_tokens = graphene.Int()
    example_input = graphene.String()
    example_output = graphene.String()
    use_cases = graphene.List(graphene.String)
    best_practices = graphene.String()


# ---------------------------------------------------------------------------
# Payload types
# ---------------------------------------------------------------------------

class SystemPromptPayload(graphene.ObjectType):
    from zentinelle.schema.types import SystemPromptType
    prompt = graphene.Field(lambda: __import__(
        'zentinelle.schema.types', fromlist=['SystemPromptType']
    ).SystemPromptType)
    errors = graphene.List(graphene.String)


class TogglePromptFavoritePayload(graphene.ObjectType):
    is_favorited = graphene.Boolean()
    errors = graphene.List(graphene.String)


class RatePromptPayload(graphene.ObjectType):
    avg_rating = graphene.Float()
    errors = graphene.List(graphene.String)


class DeletePromptPayload(graphene.ObjectType):
    success = graphene.Boolean()
    errors = graphene.List(graphene.String)


# ---------------------------------------------------------------------------
# Mutations
# ---------------------------------------------------------------------------

class CreateSystemPrompt(graphene.Mutation):
    class Arguments:
        input = CreateSystemPromptInput(required=True)

    Output = SystemPromptPayload

    @staticmethod
    def mutate(root, info, input):
        from zentinelle.models.system_prompt import PromptCategory, PromptTag
        from django.utils.text import slugify

        tenant_id = _tenant_id(info)

        name = input.get('name', '')
        prompt_text = input.get('prompt_text', '')

        if not name or len(name) < 3:
            return SystemPromptPayload(prompt=None, errors=['Name must be at least 3 characters'])
        if not prompt_text or len(prompt_text) < 10:
            return SystemPromptPayload(prompt=None, errors=['Prompt text must be at least 10 characters'])

        base_slug = slugify(name)[:180]
        slug = base_slug
        i = 1
        while SystemPrompt.objects.filter(slug=slug).exists():
            slug = f'{base_slug}-{i}'
            i += 1

        prompt = SystemPrompt(
            name=name,
            slug=slug,
            description=input.get('description', ''),
            prompt_text=prompt_text,
            prompt_type=input.get('prompt_type', SystemPrompt.PromptType.SYSTEM),
            visibility=input.get('visibility', SystemPrompt.Visibility.ORGANIZATION),
            tenant_id=tenant_id,
            compatible_providers=list(input.get('compatible_providers') or []),
            compatible_models=list(input.get('compatible_models') or []),
            recommended_temperature=input.get('recommended_temperature'),
            recommended_max_tokens=input.get('recommended_max_tokens'),
            example_input=input.get('example_input', ''),
            example_output=input.get('example_output', ''),
            use_cases=list(input.get('use_cases') or []),
            best_practices=input.get('best_practices', ''),
            template_variables=_extract_variables(prompt_text),
            status=SystemPrompt.Status.ACTIVE,
        )

        if input.get('category_id'):
            try:
                prompt.category = PromptCategory.objects.get(id=input['category_id'])
            except PromptCategory.DoesNotExist:
                pass

        prompt.save()

        if input.get('tag_ids'):
            tags = PromptTag.objects.filter(id__in=input['tag_ids'])
            prompt.tags.set(tags)

        return SystemPromptPayload(prompt=prompt, errors=[])


class UpdateSystemPrompt(graphene.Mutation):
    class Arguments:
        id = graphene.UUID(required=True)
        input = UpdateSystemPromptInput(required=True)

    Output = SystemPromptPayload

    @staticmethod
    def mutate(root, info, id, input):
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
            val = input.get(field)
            if val is not None:
                setattr(prompt, field, val)

        if input.get('prompt_text') is not None:
            prompt.prompt_text = input['prompt_text']
            prompt.template_variables = _extract_variables(input['prompt_text'])

        if input.get('compatible_providers') is not None:
            prompt.compatible_providers = list(input['compatible_providers'])

        if input.get('compatible_models') is not None:
            prompt.compatible_models = list(input['compatible_models'])

        if input.get('use_cases') is not None:
            prompt.use_cases = list(input['use_cases'])

        if input.get('category_id') is not None:
            try:
                prompt.category = PromptCategory.objects.get(id=input['category_id'])
            except PromptCategory.DoesNotExist:
                prompt.category = None

        prompt.save()

        if input.get('tag_ids') is not None:
            tags = PromptTag.objects.filter(id__in=input['tag_ids'])
            prompt.tags.set(tags)

        return SystemPromptPayload(prompt=prompt, errors=[])


class DeleteSystemPrompt(graphene.Mutation):
    class Arguments:
        id = graphene.UUID(required=True)

    Output = DeletePromptPayload

    @staticmethod
    def mutate(root, info, id):
        tenant_id = _tenant_id(info)
        try:
            prompt = SystemPrompt.objects.get(id=id, tenant_id=tenant_id)
            prompt.delete()
            return DeletePromptPayload(success=True, errors=[])
        except SystemPrompt.DoesNotExist:
            return DeletePromptPayload(success=False, errors=['Prompt not found'])


class ForkSystemPrompt(graphene.Mutation):
    class Arguments:
        id = graphene.UUID(required=True)
        organization_id = graphene.UUID()  # ignored in standalone, kept for frontend compat

    Output = SystemPromptPayload

    @staticmethod
    def mutate(root, info, id, organization_id=None):
        from django.utils.text import slugify

        tenant_id = _tenant_id(info)

        try:
            source = SystemPrompt.objects.get(id=id)
        except SystemPrompt.DoesNotExist:
            return SystemPromptPayload(prompt=None, errors=['Source prompt not found'])

        base_slug = slugify(f'{source.name}-fork')[:175]
        slug = base_slug
        i = 1
        while SystemPrompt.objects.filter(slug=slug).exists():
            slug = f'{base_slug}-{i}'
            i += 1

        fork = SystemPrompt.objects.create(
            name=f'{source.name} (fork)',
            slug=slug,
            description=source.description,
            prompt_text=source.prompt_text,
            prompt_type=source.prompt_type,
            visibility=SystemPrompt.Visibility.ORGANIZATION,
            tenant_id=tenant_id,
            compatible_providers=source.compatible_providers,
            compatible_models=source.compatible_models,
            recommended_temperature=source.recommended_temperature,
            recommended_max_tokens=source.recommended_max_tokens,
            example_input=source.example_input,
            example_output=source.example_output,
            use_cases=source.use_cases,
            best_practices=source.best_practices,
            template_variables=source.template_variables,
            variable_defaults=source.variable_defaults,
            variable_descriptions=source.variable_descriptions,
            parent_prompt=source,
            fork_count=0,
            status=SystemPrompt.Status.ACTIVE,
        )

        fork.tags.set(source.tags.all())

        # Increment source fork count
        SystemPrompt.objects.filter(id=source.id).update(
            fork_count=source.fork_count + 1
        )

        return SystemPromptPayload(prompt=fork, errors=[])


class TogglePromptFavorite(graphene.Mutation):
    class Arguments:
        prompt_id = graphene.UUID(required=True)

    Output = TogglePromptFavoritePayload

    @staticmethod
    def mutate(root, info, prompt_id):
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


class RateSystemPrompt(graphene.Mutation):
    class Arguments:
        prompt_id = graphene.UUID(required=True)
        rating = graphene.Int(required=True)
        review = graphene.String()

    Output = RatePromptPayload

    @staticmethod
    def mutate(root, info, prompt_id, rating, review=None):
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
