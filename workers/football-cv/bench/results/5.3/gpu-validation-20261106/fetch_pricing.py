"""Read-only: Cloud Billing Catalog list prices for the proposed GPU session. Never prints credentials."""
import json, subprocess, urllib.request, urllib.parse, datetime, os, ssl, pathlib
os.environ.pop("CLOUDSDK_AUTH_ACCESS_TOKEN", None)
HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "pricing_20261106.json"
gcloud = os.environ.get("CLOUDSDK_GCLOUD_CMD") or ("gcloud.cmd" if os.name == "nt" else "gcloud")
tok = subprocess.check_output(
    [gcloud, "auth", "print-access-token"],
    text=True,
    env={**os.environ},
).strip()
ca = os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE")
ctx = ssl.create_default_context(cafile=ca) if ca else ssl.create_default_context()


def skus(service):
    out, page = [], ""
    while True:
        q = {"currencyCode": "USD", "pageSize": 5000}
        if page:
            q["pageToken"] = page
        req = urllib.request.Request(
            f"https://cloudbilling.googleapis.com/v1/services/{service}/skus?" + urllib.parse.urlencode(q),
            headers={"Authorization": f"Bearer {tok}", "x-goog-user-project": "scoutx-230b0"},
        )
        d = json.load(urllib.request.urlopen(req, context=ctx, timeout=120))
        out += d.get("skus", [])
        page = d.get("nextPageToken", "")
        if not page:
            return out


def price(s):
    pe = s["pricingInfo"][0]["pricingExpression"]
    tiers = []
    for t in pe["tieredRates"]:
        u = t["unitPrice"]
        tiers.append({"startUsage": t.get("startUsageAmount", 0), "usd": int(u.get("units", 0)) + u.get("nanos", 0) / 1e9})
    return {
        "skuId": s["skuId"],
        "description": s["description"],
        "unit": pe["usageUnit"],
        "tiers": tiers,
        "regions": s.get("serviceRegions"),
        "effective": s["pricingInfo"][0].get("effectiveTime"),
    }


ts = datetime.datetime.now(datetime.timezone.utc).isoformat()
ce = skus("6F81-5844-456A")
gcs = skus("95FF-2EF5-5EA1")
want_ce = lambda s: ("europe-west4" in (s.get("serviceRegions") or [])) and any(
    k in s["description"]
    for k in (
        "G2 Instance Core running in Netherlands",
        "G2 Instance Ram running in Netherlands",
        "Nvidia L4 GPU running in Netherlands",
        "Balanced PD Capacity in Netherlands",
    )
) and "Spot" not in s["description"] and "Preemptible" not in s["description"] and "Commitment" not in s["description"] and "DWS" not in s["description"]
want_ip = lambda s: s["description"].startswith("External IP Charge on a Standard VM") or s["description"].startswith("External IP Charge on a Spot")
want_eg = lambda s: ("europe-west4" in (s.get("serviceRegions") or [])) and (
    "Network Internet Egress from Netherlands" in s["description"] or "Network Inter Zone" in s["description"]
)
want_gcs = lambda s: (
    (("europe-west4" in (s.get("serviceRegions") or [])) and ("Standard Storage Netherlands" in s["description"] or "Regional Standard Class A" in s["description"] or "Regional Standard Class B" in s["description"]))
    or "Download Worldwide Destinations (excluding Asia & Australia)" in s["description"]
    or s["description"].startswith("Networking Traffic Egress GCP Services Europe to Internet")
)
rec = {
    "retrievedUtc": ts,
    "source": "Cloud Billing Catalog API (USD list prices, before tax/discounts); read-only",
    "computeEngine": [price(s) for s in ce if want_ce(s)],
    "externalIp": [price(s) for s in ce if want_ip(s)],
    "networkEgress": [price(s) for s in ce if want_eg(s)],
    "cloudStorage": [price(s) for s in gcs if want_gcs(s)],
}
OUT.write_text(json.dumps(rec, indent=1))
for k in ("computeEngine", "externalIp", "networkEgress", "cloudStorage"):
    for p in rec[k]:
        print(k, p["skuId"], p["description"], p["unit"], [round(t["usd"], 6) for t in p["tiers"]][:4])
