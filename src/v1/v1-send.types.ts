export interface V1SendResult {
  requestId: string;
  messageId: string;
  status: 'sent';
  sentAt: string;
}
