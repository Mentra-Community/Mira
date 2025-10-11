FROM oven/bun:latest

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies (including dev dependencies for build)
RUN bun install

# Copy the application code
COPY . .

# Set environment variables for build and runtime
ENV AUGMENTOS_API_KEY=${AUGMENTOS_API_KEY}
ENV PACKAGE_NAME=${PACKAGE_NAME}
ENV PORT=80
ENV NODE_ENV=production

# build the frontend application
RUN bun run build:frontend

# Expose the port
EXPOSE 80
