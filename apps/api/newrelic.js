"use strict";

/**
 * New Relic configuration for the API process.
 * The license key is read from NEW_RELIC_LICENSE_KEY. Do not write the key in this file.
 */
exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME || "SignalDesk-API"],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  agent_enabled: process.env.NEW_RELIC_ENABLED === "true",
  logging: {
    level: "info",
    filepath: "stdout",
  },
  allow_all_headers: false,
  attributes: {
    exclude: [
      "request.headers.*",
      "response.headers.*",
      "request.parameters.*",
      "request.headers.cookie",
      "request.headers.authorization",
      "request.headers.proxyAuthorization",
      "request.headers.setCookie*",
      "request.headers.x*",
      "response.headers.cookie",
      "response.headers.authorization",
      "response.headers.proxyAuthorization",
      "response.headers.setCookie*",
      "response.headers.x*",
      "error.message",
      "error.stack",
    ],
  },
  error_collector: {
    ignore_status_codes: [400, 401, 403, 404, 409, 422, 429],
  },
  strip_exception_messages: {
    enabled: true,
  },
  transaction_tracer: {
    record_sql: "obfuscated",
  },
  application_logging: {
    forwarding: {
      enabled: false,
    },
  },
  browser_monitoring: {
    enable: false,
  },
};
