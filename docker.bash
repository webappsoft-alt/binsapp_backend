#!/bin/bash

# Docker Build and Push Script for GitHub Container Registry (GHCR)
echo "Starting Docker build and push process..."

# Configuration
IMAGE_NAME="binsApp"
GITHUB_USER="arslan0044"
TAG="latest"
GHCR_IMAGE="ghcr.io/$GITHUB_USER/$IMAGE_NAME:$TAG"
LOG_FILE="docker-push.log"

# Authenticate with GitHub Container Registry
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Logging into GHCR..." | tee $LOG_FILE
echo $CR_PAT | docker login ghcr.io -u $GITHUB_USER --password-stdin 2>&1 | tee -a $LOG_FILE

if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo "ERROR: GHCR login failed - see $LOG_FILE for details" | tee -a $LOG_FILE
    exit 1
fi

# Build the Docker image
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Building Docker image..." | tee -a $LOG_FILE
docker build -t $IMAGE_NAME . 2>&1 | tee -a $LOG_FILE

if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo "ERROR: Build failed - see $LOG_FILE for details" | tee -a $LOG_FILE
    exit 1
fi

# Tag the image for GHCR
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Tagging image as $GHCR_IMAGE..." | tee -a $LOG_FILE
docker tag $IMAGE_NAME $GHCR_IMAGE 2>&1 | tee -a $LOG_FILE

if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo "ERROR: Tagging failed - see $LOG_FILE for details" | tee -a $LOG_FILE
    exit 1
fi

# Push the image to GHCR
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pushing image to GHCR..." | tee -a $LOG_FILE
docker push $GHCR_IMAGE 2>&1 | tee -a $LOG_FILE

if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo "ERROR: Push failed - see $LOG_FILE for details" | tee -a $LOG_FILE
    exit 1
fi

# Success
echo "[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS: Image pushed to $GHCR_IMAGE" | tee -a $LOG_FILE
echo "Docker image successfully built and pushed to GHCR!"
echo "Operation log saved to $LOG_FILE"
