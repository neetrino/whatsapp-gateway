export type ProjectWebhookEventType =
  | 'message.received'
  | 'message.ack'
  | 'message.reaction'
  | 'message.edited'
  | 'message.revoked'
  | 'session.status';

export interface ProjectWebhookPayload {
  eventId: string;
  accountId: string;
  type: ProjectWebhookEventType;
  timestamp: string;
  data: Record<string, unknown>;
}
