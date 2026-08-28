export type NormalizedParticipantRole = 'participant' | 'admin' | 'superadmin' | 'left' | 'unknown';

export interface NormalizedGroup {
  id: string;
  name: string;
  participantCount: number | null;
  pictureUrl: string | null;
}

export interface NormalizedParticipant {
  id: string;
  phone: string | null;
  role: NormalizedParticipantRole;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export interface GroupsListResult {
  groups: NormalizedGroup[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
  };
}

export interface CreateGroupResult {
  id: string;
  name: string;
}

export interface RefreshGroupsResult {
  refreshed: true;
}

export interface GroupParticipantsResult {
  groupId: string;
  participants: NormalizedParticipant[];
  count: number;
}

export interface ParticipantAddFailure {
  id: string;
  code: string;
  message: string;
}

export interface AddParticipantsResult {
  groupId: string;
  status: 'completed' | 'partial';
  added: string[];
  alreadyMembers: string[];
  failed: ParticipantAddFailure[];
}

export interface InviteLinkResult {
  groupId: string;
  inviteUrl: string;
}
