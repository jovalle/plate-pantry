FROM node:22.23.1-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY backend/package.json backend/package-lock.json ./backend/
RUN npm ci --prefix backend --omit=dev --no-audit --no-fund

COPY . .

ARG NEXT_PUBLIC_PLATE_PANTRY_BASE_PATH=/plate-pantry
ARG SOURCE_COMMIT=unknown
ENV NEXT_PUBLIC_PLATE_PANTRY_BASE_PATH=$NEXT_PUBLIC_PLATE_PANTRY_BASE_PATH
ENV SOURCE_COMMIT=$SOURCE_COMMIT

RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:22.23.1-bookworm-slim AS runtime

WORKDIR /app

ARG SOURCE_COMMIT=unknown
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5360
ENV DMV_BACKEND_PORT=8080
ENV DMV_PROXY_REQUIRED=0
ENV NEXT_PUBLIC_PLATE_PANTRY_BASE_PATH=/plate-pantry
ENV PLATE_PANTRY_PUBLIC_ORIGIN=http://localhost:5360
ENV PLATE_PANTRY_SSR_ORIGIN=plate-pantry
ENV PLATE_PANTRY_STATS_DIR=/data
ENV PLATE_PANTRY_NO_OPEN=1
ENV SOURCE_COMMIT=$SOURCE_COMMIT

COPY --chown=node:node --from=build /app /app

RUN mkdir -p /data && chown node:node /data

USER node

EXPOSE 5360

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5360/plate-pantry').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["npm", "start"]
