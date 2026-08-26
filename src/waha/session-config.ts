import { WhatsappAccountMode } from '@prisma/client';

export interface WahaSessionConfigPayload {
  name: string;
  config: {
    noweb: {
      store: {
        enabled: boolean;
        fullSync: false;
      };
    };
  };
}

export const buildSessionConfig = (
  sessionName: string,
  mode: WhatsappAccountMode,
): WahaSessionConfigPayload => ({
  name: sessionName,
  config: {
    noweb: {
      store: {
        enabled: mode === WhatsappAccountMode.MESSENGER,
        fullSync: false,
      },
    },
  },
});

export const isNowebStoreEnabled = (config: unknown): boolean => {
  if (!config || typeof config !== 'object') return false;
  const noweb = (config as { noweb?: { store?: { enabled?: unknown } } }).noweb;
  return noweb?.store?.enabled === true;
};
