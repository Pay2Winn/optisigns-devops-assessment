# Azure monthly cost estimate

Prepared for the assessment reviewer, 2026-09-30. Currency: USD; region: Southeast Asia; Linux pay-as-you-go; 730 hours/month (30.4167 days); no reservation, spot, negotiated discount or taxes. Public Azure Retail Prices API rates were retrieved during this authoring session. This is a **scenario estimate for the Terraform reference, not an invoice or an inspection of the running subscription**.

## Summary

- **Reference infrastructure baseline: approximately $222.60/month**, including two nodes, an assumed Premium OS disk tier, Basic ACR, one Standard Load Balancer, one public IPv4 and 1 GB of state Blob data.
- **Illustrative application scenario: approximately $231.95/month**, adding two 32 GiB Standard SSD disks (NFS backing data and PostgreSQL), a second public IPv4, 100 GB Load Balancer processing, 100,000 Key Vault operations and 20,000 Blob writes.
- Internet egress, other storage transactions, backups, log ingestion, additional rules/resources and taxes are usage-dependent and **not included**. There is no unconditional all-in total without those quantities.

**Blob stores Terraform state only. The existing self-hosted NFS server stores media; no Azure Files service is provisioned or priced.** NFS/Argo CPU consumption is included in node compute when they run on those nodes, not charged as a separate VM.

## Infrastructure baseline

| Resource / exact meter | Quantity and rate | USD/month |
|---|---|---:|
| AKS Free management tier | No management-tier charge | 0.00 |
| Linux Standard_D2s_v5, regular consumption | 2 × 730 h × $0.12/h | 175.20 |
| Premium SSD Managed Disks, P6 LRS Disk (64 GiB) | 2 × $10.207/month | 20.414 |
| Container Registry, Basic Registry Unit | 730/24 days × $0.1666/day | 5.0674 |
| Load Balancer, Standard Included LB Rules and Outbound Rules | 730 h × $0.025/h | 18.25 |
| IP Addresses, Standard IPv4 Static Public IP | 730 h × $0.005/h | 3.65 |
| General Block Blob v2, Hot LRS Data Stored (first capacity tier) | Assumed 1 GB including state versions × $0.02/GB-month | 0.02 |
| **Baseline** | Unrounded sum $222.6014167 | **222.60** |

The AKS module specifies two 64 GiB managed OS disks, but does not explicitly select their SKU. P6 Premium SSD is a conservative pricing assumption, **not a Terraform-plan observation**. If the effective tier were Standard SSD E6 LRS ($4.80/month each), the baseline would be $211.79/month instead. Confirm effective disks before treating either figure as a deployment quote.

The standard Load Balancer meter is global; the other regional meters above are Southeast Asia. One outbound Load Balancer/IP is budgeted for `outbound_type=loadBalancer`. Application ingress can share the same Standard Load Balancer with an additional frontend IP/rule; a separate Load Balancer costs more. The included-rule band is assumed; additional rules use their own meter. Actual billing depends on resources/rules allocated.

## Illustrative application and usage additions

These quantities are assumptions for a small demonstration, not resources or traffic discovered in Azure. PostgreSQL/NFS backing storage and ingress are application-managed, outside the Terraform Azure root.

| Additional item | Assumption | USD/month |
|---|---|---:|
| Standard SSD Managed Disks, E4 LRS Disk | 2 × 32 GiB disks × $2.40/month (one NFS data disk, one PostgreSQL disk) | 4.80 |
| Second Standard public IPv4 | 730 h × $0.005/h, for application frontend | 3.65 |
| Standard Load Balancer Data Processed | 100 GB × $0.005/GB | 0.50 |
| Key Vault Standard Operations | 100,000 operations / 10,000 × $0.03 | 0.30 |
| Hot LRS Blob Write Operations | 20,000 / 10,000 × $0.05 | 0.10 |
| **Additions** | | **9.35** |
| **Baseline + illustrative additions** | $222.6014167 + $9.35 | **231.95** |

If NFS uses existing node storage rather than a dedicated data disk, do not add that disk again; document the resulting durability/capacity limitation. If NFS runs outside the two AKS nodes, add its host compute separately. A requested 8 GiB PostgreSQL disk may be billed at the applicable minimum disk tier; the example budgets a 32 GiB E4 rather than multiplying a per-GB price. The actual deployment's volume sizes/SKUs were not inspected.

## Costs not fixed by Terraform

- Internet/inter-region egress: billable GB × applicable regional/tier rate after any eligible allowance. Load Balancer processing and network egress are different charges. No assumption that all video downloads are free.
- Blob reads/list/other operations, additional versions/soft-deleted capacity and disk transactions: add their actual meters. Lease locking has no separate lock-server VM, but storage operations still apply.
- More than the included Load Balancer rule band: published global Standard overage meter is $0.01 per rule-hour. A separate standard LB adds its applicable hourly base charge.
- Extra registry storage/build tasks, backups/snapshots, paid logs, private endpoints, support and taxes.
- Upgrade surge: the configuration allows one additional node temporarily; add $0.12 per surge-node hour plus its disk and any related charges.
- Argo CD, managed identity, federation, VNet/subnet and the self-hosted NFS software have no separate software subscription in this design. Underlying compute/storage/network still cost money.
- AKS Free means free management tier, **not free nodes**. Two small nodes have not been benchmarked for heavy transcoding or high availability.

## Source and reproducibility

Official public endpoint: https://prices.azure.com/api/retail/prices . Queries used `priceType eq 'Consumption'` and `armRegionName eq 'southeastasia'`, with serviceName filters `Container Registry`, `Storage`, `Virtual Network`, `Key Vault`; compute filtered `armSkuName eq 'Standard_D2s_v5'`. Load Balancer used `armRegionName=Global`. Select Linux regular consumption, not Windows, Spot, Low Priority, reservations, free meters or upper storage-capacity tiers. Response currency was USD.

Example query (URL-encode spaces/quotes when invoking directly):

```text
https://prices.azure.com/api/retail/prices?$filter=armRegionName eq 'southeastasia' and armSkuName eq 'Standard_D2s_v5' and priceType eq 'Consumption'
```

Meter effective dates are not retrieval dates: for example the compute response carried 2021-11-01 while the rate was retrieved in this assessment session. Prices can change; rerun queries or export a fresh [Azure Pricing Calculator](https://azure.microsoft.com/pricing/calculator/) estimate before spending. A live billing reconciliation was not performed.

Official service pages: [AKS](https://azure.microsoft.com/pricing/details/kubernetes-service/), [VMs](https://azure.microsoft.com/pricing/details/virtual-machines/linux/), [ACR](https://azure.microsoft.com/pricing/details/container-registry/), [Key Vault](https://azure.microsoft.com/pricing/details/key-vault/), [Blob](https://azure.microsoft.com/pricing/details/storage/blobs/), [disks](https://azure.microsoft.com/pricing/details/managed-disks/), [Load Balancer](https://azure.microsoft.com/pricing/details/load-balancer/), [IP addresses](https://azure.microsoft.com/pricing/details/ip-addresses/), [bandwidth](https://azure.microsoft.com/pricing/details/bandwidth/).

## Cleanup impact

Stopping workloads alone does not remove registry, disks, IPs or state-storage charges. Follow [cleanup](cleanup.md); export required data, explicitly handle retained NFS/database disks, and preserve the Blob state backend until every dependent state is retired. This estimate does not authorize resource deletion.
