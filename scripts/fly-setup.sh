#!/usr/bin/env bash
# fly-setup.sh — One-time Fly.io setup for CardPulse API
#
# Usage: ./scripts/fly-setup.sh
#
# Prerequisites:
#   - fly CLI installed (https://fly.io/docs/flyctl/install/)
#   - Logged in: fly auth login
#   - Account verified and billing configured
#
# This script:
#   1. Creates the Fly.io app (cardpulse-api) in the gru region
#   2. Creates a Fly PostgreSQL database
#   3. Sets required secrets (JWT_SECRET, CORS_ALLOWED_ORIGINS)
#   4. Deploys the application
#   5. Runs database migrations

set -euo pipefail

APP_NAME="cardpulse-api"
DB_NAME="cardpulse-db"
REGION="gru"

echo "═══════════════════════════════════════════"
echo "  CardPulse — Fly.io Setup"
echo "═══════════════════════════════════════════"
echo ""

# ── Step 1: Create the app ─────────────────────────────────────────────────
echo "→ Step 1: Creating app '${APP_NAME}' in region '${REGION}'..."
if fly apps list | grep -q "${APP_NAME}"; then
    echo "  App already exists, skipping."
else
    fly apps create "${APP_NAME}" --org personal
    echo "  ✓ App created."
fi
echo ""

# ── Step 2: Create PostgreSQL database ─────────────────────────────────────
echo "→ Step 2: Creating PostgreSQL database '${DB_NAME}'..."
echo "  This will provision a Fly PostgreSQL cluster."
echo ""

if fly postgres list | grep -q "${DB_NAME}"; then
    echo "  Database already exists, skipping creation."
else
    fly postgres create \
        --name "${DB_NAME}" \
        --region "${REGION}" \
        --vm-size shared-cpu-1x \
        --initial-cluster-size 1 \
        --volume-size 1
    echo "  ✓ Database created."
fi
echo ""

# ── Step 3: Attach database to app ────────────────────────────────────────
echo "→ Step 3: Attaching database to app..."
fly postgres attach "${DB_NAME}" --app "${APP_NAME}" 2>/dev/null || echo "  Already attached or attach completed."
echo "  ✓ DATABASE_URL secret set automatically by Fly."
echo ""

# ── Step 4: Set secrets ───────────────────────────────────────────────────
echo "→ Step 4: Setting secrets..."

# Generate a random 64-character JWT secret
JWT_SECRET=$(openssl rand -base64 48 | tr -d '/+=' | head -c 64)

fly secrets set \
    JWT_SECRET="${JWT_SECRET}" \
    JWT_EXPIRATION_HOURS="24" \
    CORS_ALLOWED_ORIGINS="https://cardpulse.fly.dev,http://localhost:3000" \
    --app "${APP_NAME}"

echo "  ✓ Secrets set (JWT_SECRET, JWT_EXPIRATION_HOURS, CORS_ALLOWED_ORIGINS)."
echo ""
echo "  ⚠  Save this JWT_SECRET somewhere safe:"
echo "     ${JWT_SECRET}"
echo ""

# ── Step 5: Deploy ────────────────────────────────────────────────────────
echo "→ Step 5: Deploying application..."
fly deploy --app "${APP_NAME}"
echo "  ✓ Deployed."
echo ""

# ── Step 6: Verify ────────────────────────────────────────────────────────
echo "→ Step 6: Verifying deployment..."
sleep 5

HEALTH_URL="https://${APP_NAME}.fly.dev/health"
echo "  Checking ${HEALTH_URL}..."

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${HEALTH_URL}" 2>/dev/null || echo "000")

if [ "${HTTP_STATUS}" = "200" ]; then
    echo "  ✓ Health check passed!"
else
    echo "  ⚠ Health check returned ${HTTP_STATUS}. Check logs with: fly logs"
fi
echo ""

# ── Done ──────────────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════"
echo "  Setup Complete!"
echo "═══════════════════════════════════════════"
echo ""
echo "  App URL:    https://${APP_NAME}.fly.dev"
echo "  Health:     https://${APP_NAME}.fly.dev/health"
echo "  Dashboard:  https://fly.io/apps/${APP_NAME}"
echo ""
echo "  Useful commands:"
echo "    fly status              # App status"
echo "    fly logs                # Tail logs"
echo "    fly ssh console         # SSH into the VM"
echo "    fly postgres connect    # psql into the database"
echo "    fly deploy              # Redeploy"
echo ""
