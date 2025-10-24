"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initTelemetry = exports.createTelemetryConfig = void 0;
const createTelemetryConfig = (serviceName, version = '1.0.0') => {
    return {
        serviceName,
        serviceVersion: version,
        environment: process.env.NODE_ENV || 'development',
    };
};
exports.createTelemetryConfig = createTelemetryConfig;
// Placeholder for OpenTelemetry integration
const initTelemetry = (config) => {
    // Will be implemented with @opentelemetry/sdk-node
    console.log(`Telemetry initialized for ${config.serviceName}`);
};
exports.initTelemetry = initTelemetry;
//# sourceMappingURL=telemetry.js.map