// Notifications is no longer sent at build time.
// The daily FCM notification cron now runs in config-api (the CF Worker),
// which fetches calendar.json from each deployed site and sends topic messages
// via the FCM HTTP API using FCM_SERVER_KEY.
// createFiles.js no longer imports this file.
