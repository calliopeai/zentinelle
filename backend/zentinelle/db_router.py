class ZentinelleRouter:
    """
    Routes all zentinelle app models to the 'zentinelle' database alias,
    which uses the zentinelle schema in PostgreSQL.
    """

    app_label = "zentinelle"

    def db_for_read(self, model, **hints):
        if model._meta.app_label == self.app_label:
            return "zentinelle"
        return None

    def db_for_write(self, model, **hints):
        if model._meta.app_label == self.app_label:
            return "zentinelle"
        return None

    def allow_relation(self, obj1, obj2, **hints):
        if (
            obj1._meta.app_label == self.app_label
            or obj2._meta.app_label == self.app_label
        ):
            return True
        return None

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if app_label == self.app_label:
            return db == "zentinelle"
        return db == "default"
