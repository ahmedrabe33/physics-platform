#!/usr/bin/env bash

set -Eeuo pipefail

DOCKERHUB_USERNAME="ahmedrabie222000"
TAG="${1:-v11}"
BUILDER="physics-builder"
PLATFORM="linux/arm64"

cd "$(dirname "$0")"

build_push() {
  local image_name="$1"
  local context="$2"
  local full_image="${DOCKERHUB_USERNAME}/${image_name}:${TAG}"

  echo
  echo "=========================================="
  echo "Image:    ${full_image}"
  echo "Context:  ${context}"
  echo "Platform: ${PLATFORM}"
  echo "=========================================="

  if [ ! -f "${context}/Dockerfile" ]; then
    echo "ERROR: Dockerfile not found: ${context}/Dockerfile"
    exit 1
  fi

  docker buildx build \
    --builder "${BUILDER}" \
    --platform "${PLATFORM}" \
    --tag "${full_image}" \
    --push \
    "${context}"

  echo "Pushed: ${full_image}"
}

build_push "physics-auth-service" "./services/auth-service"
build_push "physics-student-service" "./services/student-service"
build_push "physics-content-service" "./services/content-service"
build_push "physics-progress-service" "./services/progress-service"
build_push "physics-gateway" "./gateway"
build_push "physics-frontend" "./frontend"

echo
echo "All ARM64 images were built and pushed successfully."
