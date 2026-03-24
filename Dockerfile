# ============================================================
# Stage 1: Development (with hot reload via cargo-watch)
# ============================================================
FROM rust:1.88-slim AS development

RUN apt-get update && apt-get upgrade -y && apt-get install -y \
    pkg-config \
    libssl-dev \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

RUN rustup component add rustfmt clippy \
    && cargo install cargo-watch \
    && cargo install sqlx-cli --no-default-features --features postgres

WORKDIR /app
COPY . .

EXPOSE 8080
CMD ["cargo", "watch", "-x", "run"]

# ============================================================
# Stage 2: Builder (optimized release build)
# ============================================================
FROM rust:1.88-slim AS builder

RUN apt-get update && apt-get upgrade -y && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache dependencies: copy manifests first, build with dummy main
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs \
    && cargo build --release \
    && rm -rf src

# Build real application
COPY src/ src/
COPY migrations/ migrations/
RUN touch src/main.rs && cargo build --release

# ============================================================
# Stage 3: Production (minimal runtime image)
# ============================================================
FROM debian:bookworm-slim AS production

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r appuser && useradd -r -g appuser appuser

COPY --from=builder /app/target/release/cardpulse-api /usr/local/bin/
COPY --from=builder /app/migrations/ /app/migrations/

USER appuser
EXPOSE 8080
CMD ["cardpulse-api"]
