FROM node:24.22.0-bookworm-slim AS dependencies
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.34.7 --activate
COPY . .
RUN pnpm install --frozen-lockfile
FROM dependencies AS application
ARG SERVICE=api
ARG NEXT_PUBLIC_API_ORIGIN
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NODE_ENV=production APP_MODE=live
ENV NEXT_PUBLIC_API_ORIGIN=$NEXT_PUBLIC_API_ORIGIN NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
RUN if [ "$SERVICE" = "web" ]; then pnpm --filter @beforeyou/web build; fi
RUN useradd --create-home --uid 10001 beforeyou && chown -R beforeyou:beforeyou /app
USER beforeyou
ENV SERVICE=$SERVICE
CMD ["sh", "-c", "exec pnpm --filter @beforeyou/$SERVICE start"]
