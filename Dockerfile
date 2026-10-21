FROM denoland/deno:2.9.8

WORKDIR /app

COPY . .

RUN deno cache main.js

EXPOSE 80

CMD ["run", "--allow-all", "main.js"]
