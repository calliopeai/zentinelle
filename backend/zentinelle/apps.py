from django.apps import AppConfig


class ZentinelleConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'zentinelle'
    verbose_name = 'Zentinelle - AI Governance'

    def ready(self):
        # Import signal handlers for ClickHouse audit event streaming
        import zentinelle.signals  # noqa: F401
