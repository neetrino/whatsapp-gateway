import axios from 'axios';
import {
  computeProjectWebhookSignature,
  PROJECT_WEBHOOK_SIGNATURE_ALGORITHM,
} from './waha-hmac';

export interface WebhookPostResult {
  ok: boolean;
  httpStatus: number | null;
  errorCode: string | null;
}

export const postProjectWebhook = async (
  url: string,
  signingKey: string,
  payloadJson: string,
  eventId: string,
  timeoutMs: number,
): Promise<WebhookPostResult> => {
  const timestamp = String(Date.now());
  const rawBody = Buffer.from(payloadJson, 'utf8');
  const signature = computeProjectWebhookSignature(timestamp, rawBody, signingKey);
  try {
    const response = await axios.post(url, payloadJson, {
      timeout: timeoutMs,
      maxRedirects: 0,
      headers: {
        'Content-Type': 'application/json',
        'X-Gateway-Event-Id': eventId,
        'X-Gateway-Timestamp': timestamp,
        'X-Gateway-Signature': signature,
        'X-Gateway-Signature-Algorithm': PROJECT_WEBHOOK_SIGNATURE_ALGORITHM,
      },
      validateStatus: () => true,
    });
    const ok = response.status >= 200 && response.status < 300;
    return { ok, httpStatus: response.status, errorCode: ok ? null : `HTTP_${response.status}` };
  } catch {
    return { ok: false, httpStatus: null, errorCode: 'TRANSPORT_ERROR' };
  }
};
