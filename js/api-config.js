/*
 * Change this one value after deploying backend/ to a Python host.
 * Keep the trailing slash off the URL. Existing static data remains a read-only
 * fallback while the API is unavailable, so the public directory still works.
 */
window.ICMT_API_BASE_URL = window.ICMT_API_BASE_URL || "http://127.0.0.1:8000";
