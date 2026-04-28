FROM node:22-bookworm AS builder
WORKDIR /app
COPY package.json package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/client/package.json packages/client/package.json
COPY tsconfig.json tsconfig.json
COPY packages/shared/tsconfig.json packages/shared/tsconfig.json
COPY packages/server/tsconfig.json packages/server/tsconfig.json
COPY packages/client/tsconfig.json packages/client/tsconfig.json
RUN npm install
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
RUN npm run build --workspace=@rummikub/shared && npm run build --workspace=@rummikub/server

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=builder /app/packages/shared/dist/ packages/shared/dist/
COPY --from=builder /app/packages/shared/package.json packages/shared/package.json
COPY --from=builder /app/packages/server/dist/ packages/server/dist/
COPY --from=builder /app/packages/server/package.json packages/server/package.json
COPY --from=builder /app/node_modules/ node_modules/
COPY --from=builder /app/packages/server/node_modules/ packages/server/node_modules/
COPY --from=builder /app/packages/shared/node_modules/ packages/shared/node_modules/
ENV PORT=3000
EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
