FROM node:22-alpine
WORKDIR /app
COPY package.json parse.mjs classify.mjs supabase.mjs server.mjs ./
RUN mkdir -p /app/data/queue && chown -R node:node /app/data
USER node
ENV HOST=127.0.0.1 PORT=8789 QUEUE_DIR=/app/data/queue
EXPOSE 8789
CMD ["node","server.mjs"]
