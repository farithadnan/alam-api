#!/usr/bin/env bash
# Toggle app.oh-alam.my between the Cloudflare Worker (D1) and the VPS tunnel (SQLite).
# Usage:  scripts/domain-flip.sh worker | vps
#   worker -> the app is served by the `alam` Worker (uses D1 — subject to the daily read cap)
#   vps     -> the app is served by the VPS via the cloudflared tunnel (own SQLite, no cap)
# Reads the wrangler API token at runtime from ~/.cloudflared/wrangler.env (never in this repo).
set -euo pipefail

MODE="${1:?usage: domain-flip.sh worker|vps}"
[ "$MODE" != "worker" ] && [ "$MODE" != "vps" ] && { echo "usage: domain-flip.sh worker|vps"; exit 1; }

TOKEN=$(grep -oE 'cfut_[A-Za-z0-9_-]+' ~/.cloudflared/wrangler.env | head -1)
ACCT="4fc9eb59c85b0fb8f4ac40636521b53d"
ZONE="b46071f6d3d591e4b28963b88644bc38"
HOST="app.oh-alam.my"
TUNNEL_CNAME="27591de8-5225-46ac-8424-b6ecc665e7d0.cfargotunnel.com"
API="https://api.cloudflare.com/client/v4"

j() { python3 -c "import sys,json; d=json.load(sys.stdin); $1"; }

cname_id() {
  curl -s -m20 -H "Authorization: Bearer $TOKEN" "$API/zones/$ZONE/dns_records?name=$HOST" \
    | j "print([r['id'] for r in d.get('result',[]) if r.get('type')=='CNAME'][0] if [r['id'] for r in d.get('result',[]) if r.get('type')=='CNAME'] else '')"
}
worker_attached() {
  curl -s -m20 -H "Authorization: Bearer $TOKEN" "$API/accounts/$ACCT/workers/domains?hostname=$HOST" \
    | j "print('yes' if any(r.get('hostname')=='$HOST' for r in d.get('result',[])) else 'no')"
}

if [ "$MODE" = "worker" ]; then
  CID=$(cname_id)
  if [ -n "$CID" ]; then
    echo "-> removing tunnel CNAME"
    curl -s -m30 -X DELETE -H "Authorization: Bearer $TOKEN" "$API/zones/$ZONE/dns_records/$CID" -o /dev/null -w "   del CNAME: %{http_code}\n"
  fi
  if [ "$(worker_attached)" = "yes" ]; then
    echo "-> worker domain already attached"
  else
    echo "-> attaching worker custom domain"
    curl -s -m30 -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      "$API/accounts/$ACCT/workers/domains" \
      -d "{\"hostname\":\"$HOST\",\"zone_id\":\"$ZONE\",\"zone_name\":\"oh-alam.my\",\"service\":\"alam\",\"environment\":\"production\"}" \
      | j "print('   attach: ' + ('ok' if d.get('success') else str(d.get('errors'))))"
  fi
else
  if [ "$(worker_attached)" = "yes" ]; then
    DID=$(curl -s -m20 -H "Authorization: Bearer $TOKEN" "$API/accounts/$ACCT/workers/domains?hostname=$HOST" \
      | j "print([r['id'] for r in d.get('result',[]) if r.get('hostname')=='$HOST'][0])")
    echo "-> removing worker custom domain"
    curl -s -m30 -X DELETE -H "Authorization: Bearer $TOKEN" "$API/accounts/$ACCT/workers/domains/$DID" -o /dev/null -w "   del domain: %{http_code}\n"
  fi
  CID=$(cname_id)
  if [ -n "$CID" ]; then
    echo "-> tunnel CNAME already present"
  else
    echo "-> adding tunnel CNAME"
    curl -s -m30 -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      "$API/zones/$ZONE/dns_records" \
      -d "{\"type\":\"CNAME\",\"name\":\"$HOST\",\"content\":\"$TUNNEL_CNAME\",\"proxied\":true,\"ttl\":1}" \
      | j "print('   add CNAME: ' + ('ok' if d.get('success') else str(d.get('errors'))))"
  fi
fi

echo "-- waiting for edge/DNS to settle --"
sleep 12
echo "-- live check --"
curl -s -D - -o /dev/null "https://$HOST/" | grep -i "cache-control" || true
curl -s -o /dev/null -w "   summary: %{http_code}\n" "https://$HOST/api/summary?state=Johor"
echo "done ($MODE). cache-control 'no-cache' = Worker; 'public, max-age=0' = VPS."
