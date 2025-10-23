export interface TelemetryConfig {
  serviceName: string;
  serviceVersion: string;
  environment: string;
}

export const createTelemetryConfig = (
  serviceName: string,
  version = '1.0.0',
): TelemetryConfig => {
  return {
    serviceName,
    serviceVersion: version,
    environment: process.env.NODE_ENV || 'development',
  };
};

// Placeholder for OpenTelemetry integration
export const initTelemetry = (config: TelemetryConfig): void => {
  // Will be implemented with @opentelemetry/sdk-node
  console.log(`Telemetry initialized for ${config.serviceName}`);
};

