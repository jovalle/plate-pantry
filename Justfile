set shell := ["bash", "-euo", "pipefail", "-c"]

# Show available recipes.
default:
  @just --list

# One-time setup: install dependencies and build the dashboard.
setup:
  node scripts/setup.mjs

# Start the tool: DMV lookup backend + dashboard on http://127.0.0.1:5360
run:
  npm start

# Run the dashboard in development mode (hot reload) on port 5360.
# Pass --host 0.0.0.0 to expose it to your local network.
dev *args:
  npm run dev -- {{args}}

# Run unit and backend tests.
test:
  npm test

# Format source files.
fmt:
  npm run format

# Verify formatting without changing files.
fmt-check:
  npm run format:check

# Run the linter.
lint:
  npm run lint

# Build the production application.
build:
  npm run build

# Run the complete local release gate.
check:
  npm run ci:test

# Start the same gated production release that runs automatically from main.
publish:
  gh workflow run ci.yml --ref main

# Deploy the origin container to a remote Docker host via SSH (defaults to nexus).
deploy-origin host="nexus":
  DOCKER_HOST="ssh://{{host}}" docker compose pull
  DOCKER_HOST="ssh://{{host}}" docker compose up -d --remove-orphans

# Build the production container locally.
docker-build:
  docker build -t plate-pantry:latest .

# Run the production container stack.
docker-up:
  docker compose up -d

# Stop the production container stack.
docker-down:
  docker compose down

