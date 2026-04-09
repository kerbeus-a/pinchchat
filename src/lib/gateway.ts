/**
 * Re-export HermesGatewayClient as GatewayClient for upstream compatibility.
 * All upstream code imports from './gateway' — this shim keeps those imports working.
 */
export { HermesGatewayClient as GatewayClient, type JsonPayload, type GatewayStatus } from './hermesGateway';
export type { GatewayStatus as GatewayStatusType } from './hermesGateway';
