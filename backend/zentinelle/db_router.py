ANALYTICS_MODELS = frozenset([
    'usagemetric',
    'usageaggregate',
    'auditlog',
    # The chain head is locked in the same transaction as the audit record it
    # is the head of, so it has to live in the same database.
    'auditchainhead',
])


class ZentinelleRouter:
    """
    Routes zentinelle app models to isolated PostgreSQL schemas:
    - Analytics models (UsageMetric, UsageAggregate, AuditLog) → 'analytics' alias (zentinelle_analytics schema)
    - All other zentinelle models → 'zentinelle' alias (zentinelle schema)
    - Everything else → 'default' alias (public schema)

    Same PostgreSQL instance, separate schemas. Split off with:
        pg_dump --schema=zentinelle_analytics
    """

    app_label = "zentinelle"

    def _db_for_model(self, model):
        if model._meta.app_label != self.app_label:
            return None
        if model._meta.model_name in ANALYTICS_MODELS:
            return "analytics"
        return "zentinelle"

    def db_for_read(self, model, **hints):
        return self._db_for_model(model)

    def db_for_write(self, model, **hints):
        return self._db_for_model(model)

    def allow_relation(self, obj1, obj2, **hints):
        if (
            obj1._meta.app_label == self.app_label
            or obj2._meta.app_label == self.app_label
        ):
            return True
        return None

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if app_label != self.app_label:
            return db == "default"
        if model_name and model_name in ANALYTICS_MODELS:
            return db == "analytics"
        return db == "zentinelle"
