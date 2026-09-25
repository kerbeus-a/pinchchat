import type { JsonPayload } from './kinGateway';

export const WORKSPACE_IDS = ['tasterra', 'other-company', 'home', 'everything'] as const;
export type WorkspaceId = (typeof WORKSPACE_IDS)[number];

export const INTERACTION_MODES = ['query', 'action'] as const;
export type InteractionMode = (typeof INTERACTION_MODES)[number];

export const CONNECTOR_CAPABILITIES = ['search', 'get', 'binary', 'propose', 'execute'] as const;
export type ConnectorCapability = (typeof CONNECTOR_CAPABILITIES)[number];

export const CONNECTOR_HEALTH = ['healthy', 'degraded', 'offline', 'unknown'] as const;
export type ConnectorHealthStatus = (typeof CONNECTOR_HEALTH)[number];

export interface WorkspaceDefinition {
  id: WorkspaceId;
  label: string;
  description: string;
  ownerOnly: boolean;
}

export interface WorkspaceSessionScope {
  workspaceId: WorkspaceId;
  mode: InteractionMode;
  sourceIds: string[];
  persisted: boolean;
}

export interface SourceConnection {
  id: string;
  workspaceId: Exclude<WorkspaceId, 'everything'>;
  connectorId: string;
  displayName: string;
  capabilities: ConnectorCapability[];
  enabled: boolean;
  health: {
    status: ConnectorHealthStatus;
    message: string | null;
    lastCheckedAt: string | null;
    lastSuccessAt: string | null;
  };
}

export interface EvidenceReference {
  answerMessageId: string;
  citationLabel: string;
  connectorStatus: 'complete' | 'partial' | 'failed';
  id: string;
  workspaceId: Exclude<WorkspaceId, 'everything'>;
  sourceId: string;
  sourceType: 'email' | 'attachment' | 'document' | 'odoo_record' | 'transaction';
  externalId: string;
  title: string;
  occurredAt: string | null;
  excerpt: string | null;
  deepLink: string | null;
  capturedAt: string;
}

export type CommandCenterSend = (method: string, params: JsonPayload) => Promise<JsonPayload>;

export const DEFAULT_WORKSPACE_SCOPE: WorkspaceSessionScope = {
  workspaceId: 'tasterra',
  mode: 'query',
  sourceIds: [],
  persisted: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isWorkspaceId(value: unknown): value is WorkspaceId {
  return typeof value === 'string' && (WORKSPACE_IDS as readonly string[]).includes(value);
}

function isInteractionMode(value: unknown): value is InteractionMode {
  return typeof value === 'string' && (INTERACTION_MODES as readonly string[]).includes(value);
}

function isCapability(value: unknown): value is ConnectorCapability {
  return typeof value === 'string' && (CONNECTOR_CAPABILITIES as readonly string[]).includes(value);
}

function isHealth(value: unknown): value is ConnectorHealthStatus {
  return typeof value === 'string' && (CONNECTOR_HEALTH as readonly string[]).includes(value);
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseWorkspaces(value: unknown): WorkspaceDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || !isWorkspaceId(item.id) || typeof item.label !== 'string'
      || typeof item.description !== 'string' || typeof item.ownerOnly !== 'boolean') return [];
    return [{ id: item.id, label: item.label, description: item.description, ownerOnly: item.ownerOnly }];
  });
}

export function parseWorkspaceScope(value: unknown): WorkspaceSessionScope {
  if (!isRecord(value) || !isWorkspaceId(value.workspaceId) || !isInteractionMode(value.mode)) {
    return { ...DEFAULT_WORKSPACE_SCOPE, sourceIds: [] };
  }
  const sourceIds = Array.isArray(value.sourceIds)
    ? value.sourceIds.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    workspaceId: value.workspaceId,
    mode: value.mode,
    sourceIds,
    persisted: value.persisted === true,
  };
}

export function parseSourceConnections(value: unknown): SourceConnection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !isWorkspaceId(item.workspaceId)
      || item.workspaceId === 'everything' || typeof item.connectorId !== 'string'
      || typeof item.displayName !== 'string' || typeof item.enabled !== 'boolean'
      || !isRecord(item.health) || !isHealth(item.health.status)) return [];
    const capabilities = Array.isArray(item.capabilities) ? item.capabilities.filter(isCapability) : [];
    return [{
      id: item.id,
      workspaceId: item.workspaceId,
      connectorId: item.connectorId,
      displayName: item.displayName,
      capabilities,
      enabled: item.enabled,
      health: {
        status: item.health.status,
        message: typeof item.health.message === 'string' ? item.health.message : null,
        lastCheckedAt: typeof item.health.lastCheckedAt === 'string' ? item.health.lastCheckedAt : null,
        lastSuccessAt: typeof item.health.lastSuccessAt === 'string' ? item.health.lastSuccessAt : null,
      },
    }];
  });
}

export function parseEvidenceReferences(value: unknown): EvidenceReference[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.answerMessageId !== 'string'
      || typeof item.citationLabel !== 'string' || typeof item.id !== 'string'
      || !isWorkspaceId(item.workspaceId) || item.workspaceId === 'everything'
      || typeof item.sourceId !== 'string' || typeof item.sourceType !== 'string'
      || !['email', 'attachment', 'document', 'odoo_record', 'transaction'].includes(item.sourceType)
      || typeof item.externalId !== 'string' || typeof item.title !== 'string'
      || !['complete', 'partial', 'failed'].includes(String(item.connectorStatus))
      || typeof item.capturedAt !== 'string') return [];
    const locator = isRecord(item.locator) ? item.locator : {};
    return [{
      answerMessageId: item.answerMessageId,
      citationLabel: item.citationLabel,
      connectorStatus: item.connectorStatus as EvidenceReference['connectorStatus'],
      id: item.id,
      workspaceId: item.workspaceId,
      sourceId: item.sourceId,
      sourceType: item.sourceType as EvidenceReference['sourceType'],
      externalId: item.externalId,
      title: item.title,
      occurredAt: typeof item.occurredAt === 'string' ? item.occurredAt : null,
      excerpt: typeof item.excerpt === 'string' ? item.excerpt : null,
      deepLink: safeHttpUrl(locator.deepLink),
      capturedAt: item.capturedAt,
    }];
  });
}

export function sourceHealthSummary(sources: SourceConnection[]): {
  label: string;
  status: ConnectorHealthStatus;
} {
  const enabled = sources.filter((source) => source.enabled);
  if (enabled.length === 0) return { label: 'No sources', status: 'unknown' };
  const offline = enabled.filter((source) => source.health.status === 'offline').length;
  if (offline > 0) return { label: `${offline} offline`, status: 'offline' };
  const degraded = enabled.filter((source) => source.health.status === 'degraded').length;
  if (degraded > 0) return { label: `${degraded} degraded`, status: 'degraded' };
  const unknown = enabled.filter((source) => source.health.status === 'unknown').length;
  if (unknown > 0) return { label: `${unknown} unchecked`, status: 'unknown' };
  return { label: `${enabled.length} healthy`, status: 'healthy' };
}
