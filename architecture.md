# Architecture

## Components and flow

The browser accesses localhost:8080, mapped by kind to the frontend NodePort. Two unprivileged Nginx/React replicas serve the interface and proxy GraphQL/media requests to two NestJS replicas. This is a stable Service endpoint, not a port-forward tied to one pod.

GraphQL multipart upload is buffered to temporary disk by graphql-upload and streamed to an NFS temporary file. FFprobe validates video content and limits; a same-directory rename publishes the original before a PostgreSQL job is inserted. Listing/status/output metadata use GraphQL; video bytes use HTTP with Range support. Only recorded originals and READY outputs are served.

One worker processes jobs sequentially. PostgreSQL row locking with SKIP LOCKED atomically claims a job and assigns a unique ownership token and 60-second lease. Heartbeats every ten seconds renew ownership. Expired work can be reclaimed, up to three attempts. Each attempt has a separate output directory. A conditional update publishes READY only for the current unexpired token. A stale worker cannot overwrite another attempt's files or publish its metadata. FFmpeg creates four H.264/AAC renditions sequentially plus a thumbnail.

## Storage

The NFS server exports a node-local directory, while application pods mount it through an actual NFS PersistentVolume/PersistentVolumeClaim. Clients run as UID/GID 1000; the export is root-squashed. The Service address is fixed at 10.96.0.200 within the default kind service range because node-side NFS mounting cannot assume cluster DNS resolution.

PostgreSQL has its own local-path volume, not NFS. Its application login is not a superuser, although it currently has CREATE on the public schema for startup initialization. Advisory locking serializes initialization across replicas.

The 10Gi NFS claim is descriptive capacity, not an enforced export quota. Neither storage system survives deleting the kind node. Retain on the NFS volume does not protect against deleting the Docker container holding its data.

## Availability and limits

Two frontend/backend replicas, health probes, voluntary-disruption budgets and backend preStop draining cover pod-level failures. One worker recovers through persisted leases. PostgreSQL and NFS are single points of failure. One physical host and one Kubernetes node do not provide machine-level high availability.

NFS requires a privileged container to run the kernel server. This exception is isolated to the local demo and is not a recommended public-production storage deployment. The old upstream NFS image is digest-pinned for reproducibility, not certified vulnerability-free.

Current limitations: no authentication, resumable upload, tenant quotas or automated retention. A process crash can leave orphaned temporary/attempt files; periodic safe reconciliation is not implemented. Database/file publication is not a distributed transaction. The worker exposes startup/liveness/readiness probes; more extensive malformed-media/resource-exhaustion testing remains follow-up work. If a database write response is lost, files are retained rather than risking removal of a committed original or published output. A lease is a correctness mechanism, not a guarantee of uninterrupted progress during a storage outage.
