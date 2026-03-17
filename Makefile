.PHONY: help up down restart logs db-shell test lint fmt check ci migrate seed clean build-prod deploy

# ============================================================
# Help
# ============================================================

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ============================================================
# Docker — Local Development
# ============================================================

up: ## Start all services (db + db-test + api with hot reload)
	docker compose up -d
	@echo "\n✓ API running at http://localhost:8080"
	@echo "✓ PostgreSQL at localhost:5432"
	@echo "✓ Test DB at localhost:5433"

up-tools: ## Start all services including pgAdmin
	docker compose --profile tools up -d
	@echo "\n✓ pgAdmin at http://localhost:5050"

down: ## Stop all services
	docker compose --profile tools down

restart: ## Restart the API container
	docker compose restart api

logs: ## Tail API logs
	docker compose logs -f api

logs-db: ## Tail database logs
	docker compose logs -f db

db-shell: ## Open psql shell to development database
	docker compose exec db psql -U cardpulse -d cardpulse

db-test-shell: ## Open psql shell to test database
	docker compose exec db-test psql -U cardpulse -d cardpulse_test

# ============================================================
# Development — Run inside API container
# ============================================================

test: ## Run all tests
	docker compose exec api cargo test

test-verbose: ## Run tests with output
	docker compose exec api cargo test -- --nocapture

test-watch: ## Run tests in watch mode
	docker compose exec api cargo watch -x test

lint: ## Run clippy
	docker compose exec api cargo clippy -- -D warnings

fmt: ## Format code
	docker compose exec api cargo fmt

fmt-check: ## Check formatting without modifying
	docker compose exec api cargo fmt -- --check

check: ## Run cargo check (fast compile check)
	docker compose exec api cargo check

# ============================================================
# Database
# ============================================================

migrate: ## Run database migrations
	docker compose exec api sqlx migrate run

migrate-add: ## Create a new migration (usage: make migrate-add name=description)
	docker compose exec api sqlx migrate add $(name)

migrate-revert: ## Revert last migration
	docker compose exec api sqlx migrate revert

# ============================================================
# CI — Full validation pipeline
# ============================================================

ci: fmt-check lint test ## Run full CI pipeline (format check + lint + test)
	@echo "\n✓ All CI checks passed"

# ============================================================
# Production
# ============================================================

build-prod: ## Build production Docker image
	docker build --target production -t cardpulse-api:latest .

run-prod: ## Run production image locally
	docker run --rm -p 8080:8080 \
		-e DATABASE_URL=$(DATABASE_URL) \
		-e JWT_SECRET=$(JWT_SECRET) \
		-e RUST_LOG=info \
		cardpulse-api:latest

deploy: ## Deploy to Fly.io
	fly deploy

deploy-logs: ## Tail Fly.io production logs
	fly logs

# ============================================================
# Cleanup
# ============================================================

clean: ## Remove Docker volumes and caches
	docker compose --profile tools down -v
	@echo "✓ Volumes removed"

clean-target: ## Remove local cargo target directory
	rm -rf target/
	@echo "✓ target/ removed"
