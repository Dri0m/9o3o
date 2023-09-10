FROM golang:1.20

WORKDIR /app

COPY . .

WORKDIR /app/backend

RUN rm config.json
RUN go mod download
RUN go build -o /9o3o-build *.go

CMD ["/9o3o-build"]