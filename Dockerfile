FROM node:22-slim

# Build-time public env vars used by Next.js.
# These must be provided during `docker build` (e.g. via docker-compose build args)
# so they get baked into the client bundle.
ARG NEXT_PUBLIC_TRAILBASE_URL
ENV NEXT_PUBLIC_TRAILBASE_URL=${NEXT_PUBLIC_TRAILBASE_URL}

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="${PATH}:${PNPM_HOME}"

RUN npm install --global pnpm

# Install necessary packages
RUN apt update -y && apt install -y --no-install-recommends \
    libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libxdo-dev \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    ca-certificates \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Rust and Cargo
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

COPY . /app

WORKDIR /app

RUN pnpm install

RUN pnpm --filter @readest/readest-app setup-pdfjs

WORKDIR /app/apps/readest-app

RUN pnpm build-web

ENTRYPOINT ["pnpm", "start-web"]
