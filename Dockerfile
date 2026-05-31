FROM denoland/deno:alpine-2.6.7

EXPOSE 8080

WORKDIR /app

COPY cli.ts server.ts jamulus_protocol.ts ./

RUN deno cache server.ts

CMD ["deno", "run", "--allow-net", "--allow-env", "server.ts"]
