# AI usage log

## Tool and scope

An AI coding assistant through the Claude Code interface helped read the assessment, plan the architecture, generate application code, manifests, scripts and documentation, and execute local verification. Browser automation, Docker, kubectl, kind and npm were used through tools. No claim is made that the candidate has personally reviewed every generated line.

## Prompt summaries and accepted decisions

- Analyze the supplied assessment and work only within its dedicated folder.
- Plan before implementation; complete mandatory local deployment within a short deadline.
- Explain local versus optional cloud requirements. Choose local Kubernetes; do not touch AKS.
- Install missing tools and continue implementation. Do not commit or push to Git.
- Use NFS shared storage, PostgreSQL metadata/leased queue, NestJS GraphQL, React and FFmpeg, with actual verification rather than configuration-only output.
- Continue work without routine progress reports unless requested.

## Generated and modified work

AI generated the current source, Kubernetes manifests, build/test scripts and initial documentation. Runtime evidence came from actual commands, including NFS mounts, database persistence, MP4 validation, 4K processing, browser upload, file checksums, worker recovery, image rollout/rollback and queue assertions.

## Rejected or corrected output

- Repeated attempted worktree agents could not start outside a Git repository. No repository was initialized to bypass this; implementation proceeded directly.
- An initial claim that Ubuntu integration was needed was narrowed: Windows Docker/kind plus Git Bash worked without Ubuntu integration.
- Context7 failed because its configured API key was invalid. Official upstream documentation and npm package metadata were used instead; failed lookups were not reported as successful.
- Initial NFS settings hit OOMKilled. Open-descriptor limit was bounded rather than blindly increasing memory.
- Git Bash converted Linux paths and broke a first test. Scripts now disable argument conversion and normalize host paths.
- A React closing-tag typo failed the build and was corrected. npm audit identified vulnerable Vite; it was updated from 7.1.7 to 7.3.6 before deployment.
- The first rollout checksum fetch returned HTTP 502. Added backend termination drain/readiness stabilization; retained failure evidence and reran tests.
- Namespace-local worker SIGKILL did not cause retry; the assertion caught it. Runtime-level container stop demonstrated actual retry.
- Serialized schema initialization was added after reviewing concurrent replica startup.
- Files are retained after ambiguous database write failures rather than risking deletion of committed uploads or published outputs; automated orphan reconciliation remains unimplemented.
- Rollback verification now changes and restores a pod-template configuration revision, avoiding dependence on historical local images.
- Approved cluster deletion initially hung. After a separately approved Docker Desktop restart, deletion and fresh-cluster deployment succeeded on the same host. Cleanup now drains NFS clients before the server; the complete healthy-cluster draining path remains unverified.
- Fresh-cluster acceptance stopped after PostgreSQL replacement because application containers were unavailable. Added an idle database pool error handler and waits for application recovery; follow the latest evidence for retest outcomes.

## Optional cloud authentication (2026-09-29)

The user subsequently requested AKS deployment and a single reviewer login, and authorized committing directly to main and publishing images tagged with the source commit SHA. Authentication is opt-in through AUTH_ENABLED=true; local deployment remains unauthenticated by default. Configure AUTH_USERNAME, AUTH_PASSWORD_HASH (hex salt:scrypt-derived hex key), and PUBLIC_ORIGIN (HTTPS origin) through runtime secrets/configuration, never build arguments or committed credentials.

Docker builds of both applications passed. `backend/test-auth.mjs` passed in the backend image. `backend/test-auth-integration.mjs` passed with disposable PostgreSQL and two Express instances: anonymous GraphQL/media denial, wrong password, Origin checks, secure cookie attributes, shared sessions, logout invalidation and login throttling. The harness forwards cookies programmatically over local HTTP; it does not prove browser HTTPS or full NestJS/GraphQL integration. Nginx configuration validation passed. The disposable database and network were removed. Direct host build initially failed because TypeScript dependencies were not installed; Docker used the lockfile instead.

Login throttling uses shared database counters, including a global limit, and socket addresses rather than untrusted forwarded headers. Behind a proxy, clients share its address bucket. Browser HTTPS, full application authentication, session expiry/database-failure behavior and AKS storage/deployment still require verification. Existing published reviewer-auth-v1 images contain no reviewer password; authentication must be explicitly enabled at deployment.

## Verification and outstanding review

See evidence files and failover-test.md. Passing builds do not establish production security. Worker probes and upload boundary checks were added. Full dependency/image security review, clean-machine replay, automated orphan cleanup and sustained concurrent upload tests remain outstanding. Documentation distinguishes these limits from verified behavior. The candidate should review the code, run the scripts and explain the trade-offs before submission. The user subsequently authorized GitHub submission to Pay2Winn/optisigns-devops-assessment. Local credentials, kubeconfig, sample videos and the supplied assessment PDF are excluded from the submission.
