FROM denoland/deno:2.9.8@sha256:a0d88a7fcbd44f062cba2748e19df67d30290ad12aa203c7c1e0b12462c483f0

WORKDIR /app

COPY . .

RUN deno cache main.js

EXPOSE 80

CMD ["run", "--v8-flags=--max-old-space-size=2048", "--allow-all", "main.js"]
