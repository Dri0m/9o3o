FROM denoland/deno:2.6.6

WORKDIR /app

COPY . .

RUN deno cache main.js

EXPOSE 80

CMD ["run", "--allow-all", "main.js"]
