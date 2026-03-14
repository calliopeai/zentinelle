"""
Policy Document model for uploaded policy documents.

Stores uploaded PDF/DOCX files containing company policies,
extracts text, and generates system prompts using LLM.
"""
import uuid
from django.db import models
from zentinelle.models.base import Tracking


class PolicyDocument(Tracking):
    """
    An uploaded policy document for prompt extraction.

    Users upload PDFs or DOCX files containing company policies,
    compliance requirements, or guidelines. The system extracts
    text and uses LLM to generate appropriate system prompts.
    """

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending Processing'
        PROCESSING = 'processing', 'Processing'
        EXTRACTED = 'extracted', 'Text Extracted'
        ANALYZED = 'analyzed', 'Prompts Generated'
        FAILED = 'failed', 'Processing Failed'

    class DocumentType(models.TextChoices):
        PDF = 'pdf', 'PDF Document'
        DOCX = 'docx', 'Word Document'
        TXT = 'txt', 'Text File'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # Document info
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    document_type = models.CharField(
        max_length=10,
        choices=DocumentType.choices,
        default=DocumentType.PDF
    )

    # File storage (S3 or local)
    file_path = models.CharField(
        max_length=500,
        help_text='S3 key or local path to uploaded file'
    )
    file_size = models.IntegerField(default=0, help_text='File size in bytes')
    file_hash = models.CharField(
        max_length=64,
        blank=True,
        help_text='SHA-256 hash for deduplication'
    )

    # Processing status
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING
    )
    error_message = models.TextField(blank=True)

    # Extracted content
    extracted_text = models.TextField(
        blank=True,
        help_text='Raw text extracted from document'
    )
    page_count = models.IntegerField(default=0)
    word_count = models.IntegerField(default=0)

    # LLM analysis results
    analysis_results = models.JSONField(
        default=dict,
        blank=True,
        help_text='LLM analysis including detected policy types and summaries'
    )

    # Processing metadata
    processed_at = models.DateTimeField(null=True, blank=True)
    processing_model = models.CharField(
        max_length=50,
        blank=True,
        help_text='LLM model used for analysis'
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant_id', 'status']),
            models.Index(fields=['file_hash']),
        ]

    def __str__(self):
        return f"{self.name} ({self.status})"

    @property
    def is_processed(self) -> bool:
        return self.status in [self.Status.EXTRACTED, self.Status.ANALYZED]

    @property
    def can_retry(self) -> bool:
        return self.status == self.Status.FAILED
