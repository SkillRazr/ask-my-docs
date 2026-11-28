#!/usr/bin/env bash
# Deletes everything episodes 10 and 11 created, so nothing keeps billing you.
# The quickest way is to delete the whole project instead:
#   gcloud projects delete YOUR_PROJECT_ID
# Use this script when the project holds other things you want to keep.
# It asks before each delete; add --quiet to every command to skip the questions.
set -uo pipefail
REGION=${REGION:-asia-south1}
PROJECT_ID=$(gcloud config get-value project)
BUCKET=$PROJECT_ID-ask-my-docs-uploads

gcloud functions delete ingest-upload --region=$REGION
gcloud run services delete ask-my-docs --region=$REGION
gcloud run services delete ask-my-docs-worker --region=$REGION
gcloud run jobs delete migrate --region=$REGION
gcloud run jobs delete users --region=$REGION
gcloud tasks queues delete ingestion --location=$REGION
gcloud pubsub subscriptions delete document-events-log
gcloud pubsub topics delete document-events
gcloud storage rm --recursive gs://$BUCKET
gcloud sql instances delete ask-my-docs-db          # the one that costs money while idle
gcloud artifacts repositories delete ask-my-docs --location=$REGION
for secret in db-password openai-api-key auth-secret google-client-secret; do
  gcloud secrets delete $secret
done
gcloud compute addresses delete google-managed-services-ask-my-docs --global
gcloud compute networks subnets delete ask-my-docs-subnet --region=$REGION
gcloud compute networks delete ask-my-docs-vpc
for sa in ask-my-docs-app ask-my-docs-worker ask-my-docs-tasks; do
  gcloud iam service-accounts delete $sa@$PROJECT_ID.iam.gserviceaccount.com
done
echo "Done. Check Billing > Reports tomorrow to confirm the costs have stopped."
