#!/bin/bash
set -euo pipefail

if [ -f web/.env.local ]; then
  set -a
  source web/.env.local
  set +a
fi

: "${STRAVA_CLIENT_ID:?STRAVA_CLIENT_ID is not set}"
: "${STRAVA_CLIENT_SECRET:?STRAVA_CLIENT_SECRET is not set}"

usage() {
  cat <<EOF
Usage: ./strava-webhook.sh <command> [options]

Commands:
  list                          List current subscriptions
  create <callback_url>         Create a new subscription
  delete                        Delete the current subscription

Examples:
  ./strava-webhook.sh list
  ./strava-webhook.sh create https://xxxx.ngrok-free.app/api/strava/webhook
  ./strava-webhook.sh delete
EOF
  exit 1
}

cmd_list() {
  echo "Fetching subscriptions..."
  curl -s -G https://www.strava.com/api/v3/push_subscriptions \
    -d "client_id=${STRAVA_CLIENT_ID}" \
    -d "client_secret=${STRAVA_CLIENT_SECRET}" | python3 -m json.tool
}

cmd_create() {
  local callback_url="$1"
  local verify_token="${STRAVA_WEBHOOK_VERIFY_TOKEN:-perfride-webhook-verify}"

  echo "Creating subscription..."
  echo "  callback_url:  ${callback_url}"
  echo "  verify_token:  ${verify_token}"
  echo ""

  curl -s -X POST https://www.strava.com/api/v3/push_subscriptions \
    -F "client_id=${STRAVA_CLIENT_ID}" \
    -F "client_secret=${STRAVA_CLIENT_SECRET}" \
    -F "callback_url=${callback_url}" \
    -F "verify_token=${verify_token}" | python3 -m json.tool
}

cmd_delete() {
  echo "Fetching current subscription..."
  local response
  response=$(curl -s -G https://www.strava.com/api/v3/push_subscriptions \
    -d "client_id=${STRAVA_CLIENT_ID}" \
    -d "client_secret=${STRAVA_CLIENT_SECRET}")

  local sub_id
  sub_id=$(echo "${response}" | python3 -c "import sys,json; subs=json.load(sys.stdin); print(subs[0]['id'] if subs else '')" 2>/dev/null)

  if [ -z "${sub_id}" ]; then
    echo "No subscription found."
    return
  fi

  echo "Found subscription: id=${sub_id}"
  echo "${response}" | python3 -m json.tool
  echo ""
  read -rp "Delete this subscription? [y/N] " confirm
  if [[ "${confirm}" != [yY] ]]; then
    echo "Cancelled."
    return
  fi

  curl -s -X DELETE -G "https://www.strava.com/api/v3/push_subscriptions/${sub_id}" \
    -d "client_id=${STRAVA_CLIENT_ID}" \
    -d "client_secret=${STRAVA_CLIENT_SECRET}" | python3 -m json.tool || echo "Deleted."
}

case "${1:-}" in
  list)   cmd_list ;;
  create)
    [ -z "${2:-}" ] && { echo "Error: callback_url is required"; usage; }
    cmd_create "$2"
    ;;
  delete) cmd_delete ;;
  *)      usage ;;
esac
