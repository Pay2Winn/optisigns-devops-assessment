FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends kmod zstd && rm -rf /var/lib/apt/lists/*
CMD ["sh", "-ec", "modprobe -v nfs; modprobe -v nfsd"]
