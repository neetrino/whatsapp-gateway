export type WahaSessionStatusRaw =
  | 'STARTING'
  | 'SCAN_QR_CODE'
  | 'WORKING'
  | 'FAILED'
  | 'STOPPED'
  | 'STOPPING'
  | string;

export interface WahaSessionInfo {
  name: string;
  status: WahaSessionStatusRaw;
  me?: { id?: string; pushName?: string };
}

export interface WahaQrPayload {
  mimeType: string;
  data: string;
}

/** Dashboard QR page: single normalized image source (no raw WAHA body). */
export interface QrViewModel {
  dataUrl: string | null;
  errorCode: string | null;
  errorSummary: string | null;
}

export interface WahaSendTextResult {
  id?: string;
}

export class WahaTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WahaTransportError';
  }
}

export class WahaApiError extends Error {
  readonly status: number;
  readonly upstreamCode?: string;

  constructor(message: string, status: number, upstreamCode?: string) {
    super(message);
    this.name = 'WahaApiError';
    this.status = status;
    this.upstreamCode = upstreamCode;
  }
}
