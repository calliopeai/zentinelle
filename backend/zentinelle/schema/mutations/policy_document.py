"""
GraphQL mutations for Policy Document upload and processing.

These mutations require the ZENTINELLE_POLICY_DOCUMENTS feature (Enterprise plan).
"""
import base64
import graphene
from graphene_django import DjangoObjectType

from billing.features import Features, require_feature_for_mutation
from zentinelle.models import PolicyDocument


class PolicyDocumentType(DjangoObjectType):
    """GraphQL type for PolicyDocument."""

    class Meta:
        model = PolicyDocument
        fields = [
            'id', 'name', 'description', 'document_type', 'file_size',
            'status', 'error_message', 'page_count', 'word_count',
            'analysis_results', 'processing_model', 'processed_at',
            'created_at', 'updated_at',
        ]

    generated_prompt_count = graphene.Int()
    extracted_text_preview = graphene.String()

    def resolve_generated_prompt_count(self, info):
        return self.generated_prompts.count()

    def resolve_extracted_text_preview(self, info):
        if self.extracted_text:
            return self.extracted_text[:1000] + ('...' if len(self.extracted_text) > 1000 else '')
        return None


class ExtractedPromptType(graphene.ObjectType):
    """A prompt extracted from analysis."""
    category = graphene.String()
    title = graphene.String()
    prompt_text = graphene.String()
    source_excerpt = graphene.String()
    confidence = graphene.Float()


class UploadPolicyDocument(graphene.Mutation):
    """
    Upload a policy document (PDF, DOCX, or TXT) for prompt extraction.

    The document will be processed to extract text, which can then be
    analyzed using AnalyzePolicyDocument mutation.
    """

    class Arguments:
        organization_id = graphene.UUID(required=True)
        name = graphene.String(required=True)
        description = graphene.String()
        document_type = graphene.String(required=True, description="pdf, docx, or txt")
        file_content_base64 = graphene.String(
            required=True,
            description="Base64-encoded file content"
        )

    document = graphene.Field(PolicyDocumentType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_POLICY_DOCUMENTS)
    def mutate(cls, root, info, organization_id, name, document_type, file_content_base64, description=''):
        if not info.context.user.is_authenticated:
            return UploadPolicyDocument(success=False, error="Authentication required")

        from organization.models import Organization
        from zentinelle.services.document_processing import PolicyDocumentService

        try:
            org = Organization.objects.get(id=organization_id)
        except Organization.DoesNotExist:
            return UploadPolicyDocument(success=False, error="Organization not found")

        # Validate document type
        valid_types = ['pdf', 'docx', 'txt']
        if document_type.lower() not in valid_types:
            return UploadPolicyDocument(
                success=False,
                error=f"Invalid document type. Must be one of: {', '.join(valid_types)}"
            )

        # Decode file content
        try:
            file_content = base64.b64decode(file_content_base64)
        except Exception as e:
            return UploadPolicyDocument(success=False, error=f"Invalid base64 content: {e}")

        # Size limit (10MB)
        max_size = 10 * 1024 * 1024
        if len(file_content) > max_size:
            return UploadPolicyDocument(
                success=False,
                error=f"File too large. Maximum size is {max_size // (1024*1024)}MB"
            )

        try:
            service = PolicyDocumentService(organization=org)
            document = service.upload_document(
                name=name,
                file_content=file_content,
                document_type=document_type.lower(),
                description=description,
            )
            return UploadPolicyDocument(success=True, document=document)

        except Exception as e:
            return UploadPolicyDocument(success=False, error=str(e))


class AnalyzePolicyDocument(graphene.Mutation):
    """
    Analyze an uploaded document with LLM to extract prompts.

    The document must be in 'extracted' status (text already extracted).
    This will use the specified model to analyze the document and
    generate SystemPrompt objects.
    """

    class Arguments:
        document_id = graphene.UUID(required=True)
        model = graphene.String(description="LLM model to use (default: gpt-4o-mini)")

    document = graphene.Field(PolicyDocumentType)
    extracted_prompts = graphene.List(ExtractedPromptType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_POLICY_DOCUMENTS)
    def mutate(cls, root, info, document_id, model='gpt-4o-mini'):
        if not info.context.user.is_authenticated:
            return AnalyzePolicyDocument(success=False, error="Authentication required")

        import asyncio
        from zentinelle.services.document_processing import PolicyDocumentService

        try:
            document = PolicyDocument.objects.get(id=document_id)
        except PolicyDocument.DoesNotExist:
            return AnalyzePolicyDocument(success=False, error="Document not found")

        if document.status != PolicyDocument.Status.EXTRACTED:
            return AnalyzePolicyDocument(
                success=False,
                error=f"Document must be in 'extracted' status, current status: {document.status}"
            )

        try:
            service = PolicyDocumentService(organization=document.organization)

            # Run async analysis
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                analysis = loop.run_until_complete(
                    service.analyze_document(document, model=model)
                )
            finally:
                loop.close()

            # Convert prompts to GraphQL type
            extracted_prompts = [
                ExtractedPromptType(
                    category=p.get('category'),
                    title=p.get('title'),
                    prompt_text=p.get('prompt_text'),
                    source_excerpt=p.get('source_excerpt'),
                    confidence=p.get('confidence'),
                )
                for p in analysis.get('prompts', [])
            ]

            # Refresh document
            document.refresh_from_db()

            return AnalyzePolicyDocument(
                success=True,
                document=document,
                extracted_prompts=extracted_prompts,
            )

        except Exception as e:
            return AnalyzePolicyDocument(success=False, error=str(e))


class DeletePolicyDocument(graphene.Mutation):
    """Delete a policy document."""

    class Arguments:
        document_id = graphene.UUID(required=True)

    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_POLICY_DOCUMENTS)
    def mutate(cls, root, info, document_id):
        if not info.context.user.is_authenticated:
            return DeletePolicyDocument(success=False, error="Authentication required")

        try:
            document = PolicyDocument.objects.get(id=document_id)
            document.delete()
            return DeletePolicyDocument(success=True)
        except PolicyDocument.DoesNotExist:
            return DeletePolicyDocument(success=False, error="Document not found")


class RetryPolicyDocument(graphene.Mutation):
    """Retry processing a failed document."""

    class Arguments:
        document_id = graphene.UUID(required=True)

    document = graphene.Field(PolicyDocumentType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_POLICY_DOCUMENTS)
    def mutate(cls, root, info, document_id):
        if not info.context.user.is_authenticated:
            return RetryPolicyDocument(success=False, error="Authentication required")

        try:
            document = PolicyDocument.objects.get(id=document_id)
        except PolicyDocument.DoesNotExist:
            return RetryPolicyDocument(success=False, error="Document not found")

        if document.status != PolicyDocument.Status.FAILED:
            return RetryPolicyDocument(
                success=False,
                error="Can only retry failed documents"
            )

        # Reset status
        document.status = PolicyDocument.Status.PENDING
        document.error_message = ''
        document.save()

        return RetryPolicyDocument(success=True, document=document)
