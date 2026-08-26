import type { ProjectWebhookPayload } from './project-event.types';
import { hashWebhookPayload } from './webhook-secret';

export const serializeProjectWebhookPayload = (payload: ProjectWebhookPayload): string =>
  JSON.stringify(payload);

export const payloadHashOf = (payloadJson: string): string => hashWebhookPayload(payloadJson);
