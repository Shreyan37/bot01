FROM node:20-slim

# Install Difftastic dependencies and binary
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Difftastic (pre-built binary)
RUN curl -L https://github.com/Wilfred/difftastic/releases/download/0.56.1/difft-x86_64-unknown-linux-gnu.tar.gz \
    | tar xz -C /usr/local/bin difft

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy app source
COPY . .

# Create directory for private key
RUN mkdir -p /secrets

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]