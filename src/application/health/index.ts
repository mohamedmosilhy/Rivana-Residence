// Public surface of the health application module (dependency rule D-8).
export {
  CheckHealth,
  HEALTH_PROBE_TIMEOUT_MS,
  type DatabaseProbe,
  type HealthStatus,
} from "./check-health";
