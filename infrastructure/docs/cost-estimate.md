# Cost estimate methodology

Prepared 2026-09-30. Region: Southeast Asia. Currency: USD. Consumption/pay-as-you-go, Linux, 730 hours/month, two nodes, no reserved instances or negotiated discounts. This is a budget worksheet, not a bill or verified live quotation. Unit rates have not been retrieved/verified; a numeric monthly total is deliberately not invented.

| Item | Budget configuration | Monthly calculation |
|---|---|---|
| AKS management | Free tier | No management-tier charge; nodes/network/storage still charged |
| Nodes | 2 × Standard_D2s_v5 | 1460 × regional hourly VM rate |
| Node OS disks | 2 × 64 GiB managed disks | 2 × applicable disk SKU monthly price; confirm effective disk tier in Azure plan |
| Upgrade surge | Up to one additional node | Extra node hours × VM rate plus temporary disk charges |
| ACR | Basic | Daily Basic rate × days; excess storage/egress if applicable |
| Key Vault | Standard | Secret operations / billing unit × regional rate |
| State Blob | Standard GPv2 LRS | Stored GiB including old versions × rate + read/write/list transactions |
| Standard Load Balancer | AKS outbound LB | Rules/hour and processed-data charges as applicable |
| Public IPv4 | AKS outbound IP; ingress may add more | Allocated IP hours × rate |
| Egress | Internet/inter-region as used | Billable GiB × applicable tier rate |
| Application storage/database | NOT included in these modules | Add NFS service capacity/transactions and PostgreSQL disk before quoting a full application total |
| Monitoring | No paid log workspace provisioned | Add ingestion/retention costs if enabled later |

Argo CD has no separate software service fee here, but consumes node CPU/memory. Two small nodes are a cost-oriented example, not benchmarked transcoding capacity or a high-availability guarantee. Application LoadBalancer/ingress, private endpoints, backups and support/taxes may add charges. State storage remains billable after application cleanup. Purge-protected vault names cannot immediately be reused after deletion.

## Obtain a current quote

Use https://azure.microsoft.com/pricing/calculator/ with the assumptions above. Record the quote date, exact regional SKUs, unit prices, quantities, subtotals and exclusions. Compare with actual Cost Management usage only after an authorized deployment. Public retail prices can be queried at https://prices.azure.com/api/retail/prices ; filter region `southeastasia`, currency USD and Linux consumption SKU, excluding spot/reservation/Windows variants. Do not multiply a daily meter by 730 hours.

Official service pricing: [AKS](https://azure.microsoft.com/pricing/details/kubernetes-service/), [VMs](https://azure.microsoft.com/pricing/details/virtual-machines/linux/), [ACR](https://azure.microsoft.com/pricing/details/container-registry/), [Key Vault](https://azure.microsoft.com/pricing/details/key-vault/), [Blob](https://azure.microsoft.com/pricing/details/storage/blobs/), [disks](https://azure.microsoft.com/pricing/details/managed-disks/), [Load Balancer](https://azure.microsoft.com/pricing/details/load-balancer/), [IP addresses](https://azure.microsoft.com/pricing/details/ip-addresses/), [bandwidth](https://azure.microsoft.com/pricing/details/bandwidth/).

Outstanding: verified numeric rates and complete application-storage assumptions. Do not mark the cloud cost-estimate deliverable complete until these are supplied.
