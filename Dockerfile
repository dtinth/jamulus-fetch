FROM denoland/deno:alpine

EXPOSE 8080

WORKDIR /app

COPY cli.ts server.ts jamulus_protocol.ts ./

RUN deno cache server.ts

CMD ["deno", "run", "--allow-net", "--allow-env", "server.ts"]
