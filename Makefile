.PHONY: up down build migrate createsuperuser test lint schema compile shell logs

# ── Docker ────────────────────────────────────────────────────────────────────
up:
	docker compose up

down:
	docker compose down

build:
	docker compose build

# ── Backend ───────────────────────────────────────────────────────────────────
migrate:
	docker compose run --rm backend pipenv run python manage.py migrate

createsuperuser:
	docker compose run --rm backend pipenv run python manage.py createsuperuser

test:
	docker compose run --rm backend pipenv run pytest

lint:
	docker compose run --rm backend pipenv run flake8
	docker compose run --rm backend pipenv run isort --check-only .

schema:
	docker compose run --rm backend pipenv run python manage.py dev_utils --generate_schema

shell:
	docker compose run --rm backend pipenv run python manage.py shell

logs:
	docker compose logs -f backend celery

# ── Frontend ──────────────────────────────────────────────────────────────────
compile:
	docker compose run --rm frontend npm run compile

# ── Local (no Docker) ─────────────────────────────────────────────────────────
dev-backend:
	cd backend && pipenv run python manage.py runserver

dev-frontend:
	cd frontend && npm run dev

dev-celery:
	cd backend && pipenv run celery -A config worker -l info
