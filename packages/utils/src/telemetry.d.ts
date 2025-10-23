export interface TelemetryConfig {
    serviceName: string;
    serviceVersion: string;
    environment: string;
}
export declare const createTelemetryConfig: (serviceName: string, version?: string) => TelemetryConfig;
export declare const initTelemetry: (config: TelemetryConfig) => void;
//# sourceMappingURL=telemetry.d.ts.map