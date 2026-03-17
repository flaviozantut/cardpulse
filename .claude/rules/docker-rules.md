---
description: Docker and container conventions
globs: Dockerfile, docker-compose.yml, Makefile, .dockerignore
---

# Docker rules

## Development workflow
- All development commands run inside the API container via `make` targets
- Use `make test` instead of `cargo test` directly (ensures correct DATABASE_URL_TEST)
- Use `make lint` and `make fmt` for consistency
- Run `make ci` before pushing — it validates format, lint, and tests in sequence

## docker-compose.yml
- The `db` service is the development database (port 5432)
- The `db-test` service is an isolated test database (port 5433) — never mix with dev data
- The `api` service mounts the project root as a volume for hot reload
- `cargo-cache` and `target-cache` volumes persist between restarts to speed up builds
- pgAdmin is behind the `tools` profile — only starts with `make up-tools`

## Dockerfile
- Uses multi-stage build: `development` → `builder` → `production`
- Development stage includes cargo-watch and sqlx-cli
- Production stage runs as non-root user (`appuser`)
- Dependencies are cached in a separate layer (dummy main.rs trick)

## Makefile
- All targets use `docker compose exec api` to run inside the container
- `make ci` is the single command that validates everything before a push
- New make targets follow the pattern: verb or verb-noun (e.g., `test`, `migrate-add`)
- Add `##` comments to new targets — they appear in `make help`

## Rules
- Never hardcode DATABASE_URL in docker-compose.yml for production values
- Always use health checks on database services
- Pin image versions (e.g., `postgres:16-alpine`, not `postgres:latest`)
- Keep .dockerignore updated — target/ and .git/ must always be excluded
