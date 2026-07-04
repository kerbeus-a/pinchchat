/**
 * Re-export KinGatewayClient as GatewayClient.
 * Upstream PinchChat imports `GatewayClient` from './gateway'; this shim keeps
 * those imports working while pointing them at our Kin adapter.
 *
 * The HermesGatewayClient is also still re-exported from ./hermesGateway for
 * any code that wants to talk to a Hermes backend specifically.
 */
export { KinGatewayClient as GatewayClient, type JsonPayload, type GatewayStatus } from './kinGateway';
export type { GatewayStatus as GatewayStatusType } from './kinGateway';
