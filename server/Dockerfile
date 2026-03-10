FROM node:22-alpine

WORKDIR /app

# Install shared deps
COPY shared/package.json shared/
RUN cd shared && npm install

# Build shared
COPY shared/ shared/
RUN cd shared && npm run build

# Install server deps
COPY server/package.json server/
RUN cd server && npm install

# Generate Prisma client
COPY server/prisma server/prisma/
RUN cd server && npx prisma generate

# Copy server source
COPY server/ server/

CMD ["sh", "-c", "cd server && npx prisma db push --skip-generate && npm run dev"]
