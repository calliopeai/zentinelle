"""
Compliance report model for async report generation and download.
"""
from django.db import models


class Report(models.Model):
    class ReportType(models.TextChoices):
        CONTROL_COVERAGE = 'control_coverage'
        VIOLATION_SUMMARY = 'violation_summary'
        AUDIT_TRAIL = 'audit_trail'

    class Status(models.TextChoices):
        PENDING = 'pending'
        GENERATING = 'generating'
        COMPLETE = 'complete'
        FAILED = 'failed'

    tenant_id = models.CharField(max_length=255, db_index=True)
    report_type = models.CharField(max_length=30, choices=ReportType.choices)
    params = models.JSONField(default=dict)  # date_from, date_to, format, pack_name, etc.
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    format = models.CharField(max_length=10, default='csv')  # csv or pdf
    file_path = models.CharField(max_length=500, blank=True, default='')
    error_message = models.CharField(max_length=500, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = 'zentinelle'
        ordering = ['-created_at']

    def __str__(self):
        return f"Report({self.report_type}, {self.status}, tenant={self.tenant_id})"
