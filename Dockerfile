FROM node:22.16.0-alpine
WORKDIR /app
COPY package.json index.html styles.css ./
COPY server ./server
COPY src ./src
COPY vendor ./vendor
COPY assets ./assets
ENV CODECITY_CONTAINER=1
RUN apk add --no-cache git && mkdir -p /home/node/.codecity && chown node:node /home/node/.codecity
USER node
EXPOSE 8137
CMD ["node", "server/cli.cjs", "--host", "0.0.0.0", "--no-open"]
