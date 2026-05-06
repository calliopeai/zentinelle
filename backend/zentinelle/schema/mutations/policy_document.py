"""
GraphQL mutations for Policy Document upload and processing.

These mutations require the ZENTINELLE_POLICY_DOCUMENTS feature (Enterprise plan).
"""
import base64
import uuid
from typing import Optional

import strawberry

try:
    from billing.features import Features, require_feature_for_mutation
except ImportError:
    class Features:
        ZENTINELLE_POLICY_DOCUMENTS = 'zentinelle_policy_documents'
    def require_feature_for_mutation(feature):
        def decorator(fn):
            return fn
        return decorator
from zentinelle.models import PolicyDocument


@strawberry.type
class PolicyDocumentType:
    id: Optional[uuid.UUID] = None
    name: Optional[str] = None
    description: Optional[str] = None
    document_type: Optional[str] = None
    file_size: Optional[int] = None
    status: Optional[str] = None
    error_message: Optional[str] = None
    page_count: Optional[int] = None
    word_count: Optional[int] = None
    analysis_results: Optional[strawberry.scalars.JSON] = None
    processing_model: Optional[str] = None
    processed_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    generated_prompt_count: Optional[int] = None
    extracted_text_preview: Optional[str] = None


@strawberry.type
class ExtractedPromptType:
    category: Optional[str] = None
    title: Optional[str] = None
    prompt_text: Optional[str] = None
    source_excerpt: Optional[str] = None
    confidence: Optional[float] = None


@strawberry.type
class UploadPolicyDocumentPayload:
    document: Optional[PolicyDocumentType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class AnalyzePolicyDocumentPayload:
    document: Optional[PolicyDocumentType] = None
    extracted_prompts: Optional[list[ExtractedPromptType]] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class DeletePolicyDocumentPayload:
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class RetryPolicyDocumentPayload:
    document: Optional[PolicyDocumentType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


def _document_to_type(doc) -> PolicyDocumentType:
    """Convert a PolicyDocument model instance to the GraphQL type."""
    return PolicyDocumentType(
        id=doc.id,
        name=doc.name,
        description=doc.description,
        document_type=doc.document_type,
        file_size=doc.file_size,
        status=doc.status,
        error_message=doc.error_message,
        page_count=doc.page_count,
        word_count=doc.word_count,
        analysis_results=doc.analysis_results,
        processing_model=doc.processing_model,
        processed_at=str(doc.processed_at) if doc.processed_at else None,
        created_at=str(doc.created_at) if doc.created_at else None,
        updated_at=str(doc.updated_at) if doc.updated_at else None,
        generated_prompt_count=doc.generated_prompts.count(),
        extracted_text_preview=(
            doc.extracted_text[:1000] + ('...' if len(doc.extracted_text) > 1000 else '')
            if doc.extracted_text else None
        ),
    )


def upload_policy_document(info: strawberry.types.Info, organization_id: uuid.UUID, name: str, document_type: str, file_content_base64: str, description: Optional[str] = '') -> UploadPolicyDocumentPayload:
    if not info.context.request.user.is_authenticated:
        return UploadPolicyDocumentPayload(success=False, error="Authentication required")

    from organization.models import Organization
    from zentinelle.services.document_processing import PolicyDocumentService

    try:
        org = Organization.objects.get(id=organization_id)
    except Organization.DoesNotExist:
        return UploadPolicyDocumentPayload(success=False, error="Organization not found")

    valid_types = ['pdf', 'docx', 'txt']
    if document_type.lower() not in valid_types:
        return UploadPolicyDocumentPayload(
            success=False,
            error=f"Invalid document type. Must be one of: {', '.join(valid_types)}"
        )

    try:
        file_content = base64.b64decode(file_content_base64)
    except Exception as e:
        return UploadPolicyDocumentPayload(success=False, error=f"Invalid base64 content: {e}")

    max_size = 10 * 1024 * 1024
    if len(file_content) > max_size:
        return UploadPolicyDocumentPayload(
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
        return UploadPolicyDocumentPayload(success=True, document=_document_to_type(document))

    except Exception as e:
        return UploadPolicyDocumentPayload(success=False, error=str(e))


def analyze_policy_document(info: strawberry.types.Info, document_id: uuid.UUID, model: Optional[str] = 'gpt-4o-mini') -> AnalyzePolicyDocumentPayload:
    if not info.context.request.user.is_authenticated:
        return AnalyzePolicyDocumentPayload(success=False, error="Authentication required")

    import asyncio
    from zentinelle.services.document_processing import PolicyDocumentService

    try:
        document = PolicyDocument.objects.get(id=document_id)
    except PolicyDocument.DoesNotExist:
        return AnalyzePolicyDocumentPayload(success=False, error="Document not found")

    if document.status != PolicyDocument.Status.EXTRACTED:
        return AnalyzePolicyDocumentPayload(
            success=False,
            error=f"Document must be in 'extracted' status, current status: {document.status}"
        )

    try:
        service = PolicyDocumentService(organization=document.organization)

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            analysis = loop.run_until_complete(
                service.analyze_document(document, model=model)
            )
        finally:
            loop.close()

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

        document.refresh_from_db()

        return AnalyzePolicyDocumentPayload(
            success=True,
            document=_document_to_type(document),
            extracted_prompts=extracted_prompts,
        )

    except Exception as e:
        return AnalyzePolicyDocumentPayload(success=False, error=str(e))


def delete_policy_document(info: strawberry.types.Info, document_id: uuid.UUID) -> DeletePolicyDocumentPayload:
    if not info.context.request.user.is_authenticated:
        return DeletePolicyDocumentPayload(success=False, error="Authentication required")

    try:
        document = PolicyDocument.objects.get(id=document_id)
        document.delete()
        return DeletePolicyDocumentPayload(success=True)
    except PolicyDocument.DoesNotExist:
        return DeletePolicyDocumentPayload(success=False, error="Document not found")


def retry_policy_document(info: strawberry.types.Info, document_id: uuid.UUID) -> RetryPolicyDocumentPayload:
    if not info.context.request.user.is_authenticated:
        return RetryPolicyDocumentPayload(success=False, error="Authentication required")

    try:
        document = PolicyDocument.objects.get(id=document_id)
    except PolicyDocument.DoesNotExist:
        return RetryPolicyDocumentPayload(success=False, error="Document not found")

    if document.status != PolicyDocument.Status.FAILED:
        return RetryPolicyDocumentPayload(
            success=False,
            error="Can only retry failed documents"
        )

    document.status = PolicyDocument.Status.PENDING
    document.error_message = ''
    document.save()

    return RetryPolicyDocumentPayload(success=True, document=_document_to_type(document))
