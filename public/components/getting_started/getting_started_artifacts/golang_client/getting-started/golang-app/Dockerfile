FROM golang:1.18-alpine

WORKDIR /app

COPY go.mod ./
RUN go mod download

COPY main.go ./

RUN go build -o main .

CMD ["./main"]
