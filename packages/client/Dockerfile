FROM node:22-bookworm AS builder
WORKDIR /app
COPY package.json package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/client/package.json packages/client/package.json
COPY packages/shared/tsconfig.json packages/shared/tsconfig.json
COPY packages/client/tsconfig.json packages/client/tsconfig.json
COPY packages/client/vite.config.ts packages/client/vite.config.ts
COPY packages/client/vitest.config.ts packages/client/vitest.config.ts
COPY tsconfig.json tsconfig.json
RUN npm install
COPY packages/shared/ packages/shared/
COPY packages/client/ packages/client/
RUN npm run build --workspace=@rummikub/shared && npm run build --workspace=@rummikub/client

FROM nginx:alpine
COPY --from=builder /app/packages/client/dist /usr/share/nginx/html
COPY packages/client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
