#!/usr/bin/env bash
# Creates the log-based metrics, the dashboard and the alerts in Cloud Monitoring.
# Run it once from this folder's parent, after: gcloud config set project YOUR_PROJECT
# Safe to re-run: anything that already exists is skipped.
set -euo pipefail
cd "$(dirname "$0")"

for file in metrics/*.yaml; do
  name="ask_my_docs_$(basename "$file" .yaml | tr '-' '_')"
  if gcloud logging metrics describe "$name" >/dev/null 2>&1; then
    echo "metric $name already exists"
  else
    gcloud logging metrics create "$name" --config-from-file="$file"
  fi
done

gcloud monitoring dashboards create --config-from-file=dashboard.json

# Alerts. Add --notification-channels=CHANNEL_ID to get an email; list channels with
# gcloud beta monitoring channels list
for file in alerts/*.json; do
  gcloud alpha monitoring policies create --policy-from-file="$file"
done
