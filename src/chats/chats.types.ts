export type ChatType = 'group' | 'direct';

export interface ChatListItem {
  id: string;
  name: string;
  type: ChatType;
}

export interface ChatsListResult {
  items: ChatListItem[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
  };
}
