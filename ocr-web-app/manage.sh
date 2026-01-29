#!/bin/bash

# Commands to manage the OCR Web App using PM2

function show_help {
    echo "Usage: ./manage.sh [command]"
    echo "Commands:"
    echo "  start    - Start the application (backend + frontend)"
    echo "  stop     - Stop all running processes"
    echo "  restart  - Restart all processes"
    echo "  monitor  - Open the real-time dashboard"
    echo "  logs     - View streaming logs"
    echo "  status   - Show status of processes"
}

if [ -z "$1" ]; then
    show_help
    exit 1
fi

case "$1" in
    start)
        echo "Starting application..."
        npx pm2 start ecosystem.config.js
        ;;
    stop)
        echo "Stopping application..."
        npx pm2 stop all
        ;;
    restart)
        echo "Restarting application..."
        npx pm2 restart all
        ;;
    monitor)
        npx pm2 monit
        ;;
    logs)
        npx pm2 logs
        ;;
    status)
        npx pm2 status
        ;;
    *)
        echo "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
