import { WhatsappAccountMode } from '../common/db-enums';

export const WAHA_INBOUND_EVENTS = [
  'message',
  'message.ack',
  'message.reaction',
  'message.edited',
  'message.revoked',
  'session.status',
] as const;

export interface WahaWebhookConfig {
  url: string;
  events: string[];
  hmac: { key: string };
}

export interface WahaSessionConfigPayload {
  name: string;
  config: {
    noweb: {
      store: {
        enabled: boolean;
        fullSync: false;
      };
    };
    webhooks?: WahaWebhookConfig[];
  };
}

export interface BuildSessionConfigOptions {
  inboundWebhookUrl: string;
  inboundWebhookSecret: string;
}

const buildInboundWebhookUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.replace(/\/$/, '');
  return `${trimmed}/internal/waha/events`;
};

export const buildSessionConfig = (
  sessionName: string,
  mode: string,
  options: BuildSessionConfigOptions,
): WahaSessionConfigPayload => {
  const storeEnabled = mode === WhatsappAccountMode.MESSENGER;
  const base: WahaSessionConfigPayload = {
    name: sessionName,
    config: {
      noweb: {
        store: {
          enabled: storeEnabled,
          fullSync: false,
        },
      },
    },
  };

  if (!storeEnabled) return base;

  return {
    ...base,
    config: {
      ...base.config,
      webhooks: [
        {
          url: buildInboundWebhookUrl(options.inboundWebhookUrl),
          events: [...WAHA_INBOUND_EVENTS],
          hmac: { key: options.inboundWebhookSecret },
        },
      ],
    },
  };
};

export const isNowebStoreEnabled = (config: unknown): boolean => {
  if (!config || typeof config !== 'object') return false;
  const noweb = (config as { noweb?: { store?: { enabled?: unknown } } }).noweb;
  return noweb?.store?.enabled === true;
};
