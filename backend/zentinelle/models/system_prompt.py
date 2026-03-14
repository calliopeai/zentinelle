"""
System Prompt Library Models

A flexible prompt library system that supports:
- Multiple AI providers (OpenAI, Anthropic, Google, Mistral, etc.)
- Tagging for models, tasks, and domains
- Template variables for customization
- Version tracking and forking
- Community sharing and favorites
"""

import uuid
import re
from django.conf import settings
from django.db import models
from django.core.validators import MinLengthValidator
from django.contrib.postgres.fields import ArrayField


class PromptCategory(models.Model):
    """
    Categories for organizing prompts.
    Examples: Coding, Writing, Analysis, Creative, Customer Service, Research
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=50, blank=True, help_text="Icon name (e.g., MdCode, MdEdit)")
    color = models.CharField(max_length=20, default="brand", help_text="Color scheme for UI")
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', 'name']
        verbose_name_plural = 'Prompt Categories'

    def __str__(self):
        return self.name


class PromptTag(models.Model):
    """
    Flexible tagging system for prompts.
    Tag types: model, provider, task, style, domain, skill_level
    """

    class TagType(models.TextChoices):
        MODEL = 'model', 'AI Model'
        PROVIDER = 'provider', 'AI Provider'
        TASK = 'task', 'Task Type'
        STYLE = 'style', 'Writing Style'
        DOMAIN = 'domain', 'Domain/Industry'
        SKILL = 'skill', 'Skill Level'
        LANGUAGE = 'language', 'Programming Language'
        FORMAT = 'format', 'Output Format'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=100)
    tag_type = models.CharField(max_length=20, choices=TagType.choices)
    description = models.TextField(blank=True)
    color = models.CharField(max_length=20, default="gray")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['tag_type', 'name']
        unique_together = ['slug', 'tag_type']

    def __str__(self):
        return f"{self.name} ({self.get_tag_type_display()})"


class SystemPrompt(models.Model):
    """
    A reusable system prompt template.

    Inspired by:
    - OpenAI Examples: https://platform.openai.com/docs/examples
    - Claude Prompt Library: https://docs.anthropic.com/en/prompt-library
    - Google AI Prompts: https://ai.google.dev/gemini-api/prompts
    - Mistral Capabilities: https://docs.mistral.ai/capabilities/completion/prompting_capabilities
    """

    class PromptType(models.TextChoices):
        SYSTEM = 'system', 'System Prompt'
        PERSONA = 'persona', 'Persona/Role'
        TASK = 'task', 'Task Template'
        CHAIN = 'chain', 'Prompt Chain'
        FEW_SHOT = 'few_shot', 'Few-Shot Examples'
        SAFETY = 'safety', 'Safety/Guardrails'
        FORMAT = 'format', 'Output Format'

    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        ACTIVE = 'active', 'Active'
        ARCHIVED = 'archived', 'Archived'

    class Visibility(models.TextChoices):
        PRIVATE = 'private', 'Private'
        ORGANIZATION = 'organization', 'Organization'
        PUBLIC = 'public', 'Public Library'

    # Identity
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200, validators=[MinLengthValidator(3)])
    slug = models.SlugField(max_length=200)
    description = models.TextField(blank=True, help_text="Brief description of what this prompt does")

    # Organization (optional - null for public library prompts)
    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # Content
    prompt_text = models.TextField(
        validators=[MinLengthValidator(10)],
        help_text="The prompt content. Use {{variable}} for template variables."
    )
    prompt_type = models.CharField(max_length=20, choices=PromptType.choices, default=PromptType.SYSTEM)

    # Classification
    category = models.ForeignKey(
        PromptCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='prompts'
    )
    tags = models.ManyToManyField(PromptTag, blank=True, related_name='prompts')

    # Model Compatibility
    compatible_providers = ArrayField(
        models.CharField(max_length=50),
        default=list,
        blank=True,
        help_text="AI providers this works well with: openai, anthropic, google, mistral, etc."
    )
    compatible_models = ArrayField(
        models.CharField(max_length=100),
        default=list,
        blank=True,
        help_text="Specific models: gpt-4, claude-3-opus, gemini-pro, etc."
    )
    recommended_temperature = models.FloatField(
        null=True,
        blank=True,
        help_text="Recommended temperature setting (0.0-2.0)"
    )
    recommended_max_tokens = models.IntegerField(
        null=True,
        blank=True,
        help_text="Recommended max output tokens"
    )

    # Template Variables
    template_variables = ArrayField(
        models.CharField(max_length=100),
        default=list,
        blank=True,
        help_text="Variables extracted from prompt_text (auto-populated)"
    )
    variable_defaults = models.JSONField(
        default=dict,
        blank=True,
        help_text="Default values for template variables"
    )
    variable_descriptions = models.JSONField(
        default=dict,
        blank=True,
        help_text="Descriptions for each variable"
    )

    # Examples
    example_input = models.TextField(blank=True, help_text="Example user input for testing")
    example_output = models.TextField(blank=True, help_text="Example expected output")
    example_conversation = models.JSONField(
        default=list,
        blank=True,
        help_text="Multi-turn conversation example"
    )

    # Use Cases
    use_cases = ArrayField(
        models.CharField(max_length=200),
        default=list,
        blank=True,
        help_text="What tasks this prompt is good for"
    )
    best_practices = models.TextField(blank=True, help_text="Tips for using this prompt effectively")
    limitations = models.TextField(blank=True, help_text="Known limitations or edge cases")

    # Versioning
    version = models.IntegerField(default=1)
    parent_prompt = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='derived_prompts',
        help_text="If forked from another prompt"
    )
    change_log = models.TextField(blank=True, help_text="What changed in this version")

    # Status & Visibility
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    visibility = models.CharField(max_length=20, choices=Visibility.choices, default=Visibility.ORGANIZATION)
    is_featured = models.BooleanField(default=False, help_text="Featured in library homepage")
    is_verified = models.BooleanField(default=False, help_text="Verified by Calliope team")

    # Metrics
    usage_count = models.IntegerField(default=0)
    favorite_count = models.IntegerField(default=0)
    fork_count = models.IntegerField(default=0)
    avg_rating = models.FloatField(null=True, blank=True)

    # Metadata
    # TODO: decouple - created_by FK removed (use user_id/ext_user_id instead)
    user_id = models.CharField(max_length=255, db_index=True, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_featured', '-created_at']
        unique_together = ['tenant_id', 'slug', 'version']
        indexes = [
            models.Index(fields=['status', 'visibility']),
            models.Index(fields=['category', 'status']),
            models.Index(fields=['prompt_type', 'status']),
        ]

    def __str__(self):
        return f"{self.name} (v{self.version})"

    def save(self, *args, **kwargs):
        # Auto-extract template variables from prompt_text
        self.template_variables = self._extract_variables()
        super().save(*args, **kwargs)

    def _extract_variables(self):
        """Extract {{variable}} patterns from prompt text."""
        pattern = r'\{\{(\w+)\}\}'
        matches = re.findall(pattern, self.prompt_text)
        return list(set(matches))

    def render(self, variables: dict = None) -> str:
        """Render the prompt with variable substitution."""
        text = self.prompt_text
        vars_to_use = {**self.variable_defaults, **(variables or {})}
        for key, value in vars_to_use.items():
            text = text.replace(f'{{{{{key}}}}}', str(value))
        return text

    def fork(self, user=None, organization=None):
        """Create a copy of this prompt for modification."""
        new_prompt = SystemPrompt(
            name=f"{self.name} (Fork)",
            slug=f"{self.slug}-fork",
            description=self.description,
            organization=organization,
            prompt_text=self.prompt_text,
            prompt_type=self.prompt_type,
            category=self.category,
            compatible_providers=self.compatible_providers.copy(),
            compatible_models=self.compatible_models.copy(),
            recommended_temperature=self.recommended_temperature,
            recommended_max_tokens=self.recommended_max_tokens,
            template_variables=self.template_variables.copy(),
            variable_defaults=self.variable_defaults.copy(),
            variable_descriptions=self.variable_descriptions.copy(),
            example_input=self.example_input,
            example_output=self.example_output,
            use_cases=self.use_cases.copy(),
            parent_prompt=self,
            status=SystemPrompt.Status.DRAFT,
            visibility=SystemPrompt.Visibility.PRIVATE,
            created_by=user,
        )
        new_prompt.save()
        new_prompt.tags.set(self.tags.all())

        # Update fork count
        self.fork_count += 1
        self.save(update_fields=['fork_count'])

        return new_prompt

    def increment_usage(self):
        """Track prompt usage."""
        self.usage_count += 1
        self.save(update_fields=['usage_count'])


class PromptFavorite(models.Model):
    """Track user favorites for prompts."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # TODO: decouple - user FK removed (use user_id/ext_user_id instead)
    ext_user_id = models.CharField(max_length=255, db_index=True, blank=True, default="")
    prompt = models.ForeignKey(SystemPrompt, on_delete=models.CASCADE, related_name='favorites')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['ext_user_id', 'prompt']

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)
        if is_new:
            self.prompt.favorite_count += 1
            self.prompt.save(update_fields=['favorite_count'])

    def delete(self, *args, **kwargs):
        prompt = self.prompt
        super().delete(*args, **kwargs)
        prompt.favorite_count = max(0, prompt.favorite_count - 1)
        prompt.save(update_fields=['favorite_count'])


class PromptRating(models.Model):
    """User ratings for prompts."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # TODO: decouple - user FK removed (use user_id/ext_user_id instead)
    ext_user_id = models.CharField(max_length=255, db_index=True, blank=True, default="")
    prompt = models.ForeignKey(SystemPrompt, on_delete=models.CASCADE, related_name='ratings')
    rating = models.IntegerField(help_text="1-5 star rating")
    review = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['ext_user_id', 'prompt']

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Update average rating
        avg = self.prompt.ratings.aggregate(models.Avg('rating'))['rating__avg']
        self.prompt.avg_rating = avg
        self.prompt.save(update_fields=['avg_rating'])
