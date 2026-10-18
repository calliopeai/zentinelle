from django.apps import AppConfig


class ZentinelleConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'zentinelle'
    verbose_name = 'Zentinelle - AI Governance'

    def ready(self):
        # Each DB alias selects its schema when its connection opens (#484)
        import zentinelle.db_search_path  # noqa: F401
        # Import signal handlers for ClickHouse audit event streaming
        import zentinelle.signals  # noqa: F401
