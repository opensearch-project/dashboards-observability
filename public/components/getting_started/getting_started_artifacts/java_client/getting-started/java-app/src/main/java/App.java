package com.example;

import org.json.JSONObject;

import java.io.FileWriter;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Random;
import java.util.Timer;
import java.util.TimerTask;

public class App {
    public static void main(String[] args) {
        Timer timer = new Timer();
        timer.schedule(new LogTask(), 0, 5000); // Generate a log every 5 seconds
    }
}

class LogTask extends TimerTask {
    private static final String LOG_FILE = "/logs/app.log";
    private static final SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
    private static final Random random = new Random();

    private static final String[] messages = {
            "Application started successfully.",
            "User logged in.",
            "Error accessing database.",
            "File not found.",
            "Connection timeout.",
            "User logged out.",
            "Data saved successfully."
    };

    private static final String[] levels = {
            "info",
            "error",
            "warning",
            "debug"
    };

    @Override
    public void run() {
        JSONObject logEntry = new JSONObject();
        logEntry.put("timestamp", sdf.format(new Date()));
        logEntry.put("level", levels[random.nextInt(levels.length)]);
        logEntry.put("message", messages[random.nextInt(messages.length)]);
        logEntry.put("source", "your_java_project");
        logEntry.put("module", "main");
        logEntry.put("function", "start_app");

        try (FileWriter file = new FileWriter(LOG_FILE, true)) {
            file.write(logEntry.toString() + "\n");
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}
