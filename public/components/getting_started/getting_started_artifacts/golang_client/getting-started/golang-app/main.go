package main

import (
    "encoding/json"
    "fmt"
    "os"
    "time"
)

type Log struct {
    Timestamp string `json:"timestamp"`
    Level     string `json:"level"`
    Message   string `json:"message"`
    Source    string `json:"source"`
    Module    string `json:"module"`
    Function  string `json:"function"`
}

func main() {
    log := Log{
        Timestamp: time.Now().Format(time.RFC3339),
        Level:     "info",
        Message:   "Application started successfully.",
        Source:    "your_golang_project",
        Module:    "main",
        Function:  "start_app",
    }

    file, err := os.OpenFile("/logs/app.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
    if err != nil {
        fmt.Println("Error opening log file:", err)
        return
    }
    defer file.Close()

    logData, err := json.Marshal(log)
    if err != nil {
        fmt.Println("Error marshaling log:", err)
        return
    }

    _, err = file.WriteString(string(logData) + "\n")
    if err != nil {
        fmt.Println("Error writing log to file:", err)
    }
}
