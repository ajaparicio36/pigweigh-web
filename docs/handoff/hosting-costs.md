# Railway hosting costs

Prices and metrics checked 2026-11-03. This is a budget model, not an invoice or a statement of this workspace's plan, credits, billing cycle, charges, taxes or balance; those were not available in the read-only review. The project was not serving on that date. [Deployment status](deployment.md#current-state-2026-11-03) explains why its past usage cannot establish its present running cost.

## Provider rates

[Railway's pricing](https://docs.railway.com/pricing) lists container RAM at **$10 per GB-month**, CPU at **$20 per vCPU-month**, public network egress at **$0.05 per GB**, and volume storage at **$0.15 per GB-month**. [Railway says](https://docs.railway.com/volumes/reference#pricing) it charges for volume space used, including filesystem metadata, rather than the allocated maximum. [Service builds are free](https://docs.railway.com/pricing/plans#resource-usage-pricing) under the listed policy. Prices and policies can change; check them again before budgeting.

The observed Postgres volume was allocated **5000 MB**, while a metrics reading showed **0.135856 GB used**. These are different quantities. At unchanged usage for a whole month, 0.135856 × $0.15 is about **$0.02**; charging the entire allocation as if it were used would be misleading. A retained volume can still incur storage charges when applications are unavailable; check its actual status and account billing.

## Observations and their limits

Read-only Railway service metrics requested a seven-day window ending around `2026-11-03 04:53 UTC` with hourly samples. The CLI returned 169 aligned timestamps from `2026-10-27 04:00 UTC` through `2026-11-03 04:00 UTC`. The most recent successful API, web and Postgres deployments were removed around `2026-11-02 00:13:38–40 UTC`, and the public web routes returned 404 on November 3.

The **141 hourly samples timestamped through November 2 00:00 UTC**, before the removal timestamp, have the means below. The 00:00 bucket may overlap removal; precise bucket boundaries and time weighting were not established. These are a short, lightly loaded historical observation, not minute-by-minute billing data or a traffic forecast. Following removal, the next 28 hourly samples showed zero CPU and exactly repeated the same final RAM value for every service. Those points are consistent with stale or carried-forward values; their semantics were not established. They are excluded from the planning averages and are not evidence of live services or billable running RAM.

| Service | Pre-removal mean RAM, GB | Pre-removal mean CPU, vCPU |
|---|---:|---:|
| API | 0.639479 | 0.00154191 |
| web | 0.124581 | 0.00001854 |
| Postgres | 0.030324 | 0.00026026 |
| **Total** | **0.794385** | **0.00182071** |

Read-only reproduction, with the Railway CLI authenticated to the intended account:

```powershell
railway metrics --project cf533c71-e072-4820-93b6-0ff4eb38c9a1 `
  --environment b5867d65-7d2b-46c7-b602-539f753dbf1d `
  --service 44ef6557-1826-45dc-b452-8bad3a121e1e `
  --since 7d --raw --json --cpu --memory
```

Replace the service ID with the web or Postgres ID in [deployment](deployment.md#current-state-2026-11-03) to inspect those series. This moving seven-day window will differ later. The CLI reports aligned sample timestamps; it does not establish the meaning of each extrapolated point after removal. Consult Railway's usage/invoice view for billable amounts.

## Example monthly scenarios

The following assumes a 30-day equivalent month, one replica of each service running continuously after a future authorized recovery, the historical **pre-removal** mean compute, and unchanged volume usage. No recovery is implied or authorized by this arithmetic.

| Component | Calculation | Approximate cost |
|---|---|---:|
| RAM | 0.794385 GB × $10 | $7.94 |
| CPU | 0.00182071 vCPU × $20 | $0.04 |
| Volume | 0.135856 GB × $0.15 | $0.02 |
| Subtotal | before egress, backups and other charges | **$8.00** |
| Example with 10 GB public egress | $8.00 + 10 × $0.05 | **$8.50** |
| Higher-use illustration | 2× observed RAM and CPU, 1 GB used volume, 100 GB egress | **$21.11** |

The higher example is an illustrative sensitivity case, not a predicted upper bound. Actual inference traffic, concurrency, service restarts, storage growth, egress, backups, additional replicas, other services, taxes and price changes can alter the outcome. No egress value or backup charge was inferred from the samples. This is project resource usage only and excludes other workspace projects and products.

The subscription and included usage apply at the **workspace/account billing level**, not separately to each service. For example, Railway's [published Hobby terms](https://docs.railway.com/pricing/plans#included-usage) say $5/month includes $5 usage: if the entire workspace has $8.50 of eligible usage, the simple example total is $8.50, not $13.50. Pro's published $20 subscription similarly includes $20 usage. Credits, promotions, extra products and taxes can change the amount due. The actual plan and billing summary were not verified; do not treat either example as the user's bill.
