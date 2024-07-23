import json
import time
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(filename='/logs/app.log', level=logging.INFO, format='%(message)s')

def generate_log():
    log_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "level": "info",
        "message": "Application started successfully.",
        "source": "your_python_project",
        "module": "main",
        "function": "start_app"
    }
    logging.info(json.dumps(log_entry))

if __name__ == "__main__":
    while True:
        generate_log()
        time.sleep(5)  # Generate a log every 5 seconds
