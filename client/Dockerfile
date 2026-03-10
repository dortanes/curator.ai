FROM node:22-alpine

WORKDIR /app

# Install shared deps
COPY shared/package.json shared/
RUN cd shared && npm install

# Build shared
COPY shared/ shared/
RUN cd shared && npm run build

# Install client deps
COPY client/package.json client/
RUN cd client && npm install

# Copy client source
COPY client/ client/

WORKDIR /app/client
CMD ["npm", "run", "dev"]
