export interface FriendProfile {
  readonly displayName: string;
  readonly signature: string;
  readonly userId: string;
}

export interface FriendListItem {
  readonly createdAt: string;
  readonly friend: FriendProfile;
  readonly relationshipId: string;
}

export interface FriendInvite {
  readonly expiresAt: string;
  readonly sharePath: string;
  readonly token: string;
}

export interface FriendInvitePreview {
  readonly expiresAt: string;
  readonly inviter: FriendProfile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseFriendProfile(value: unknown): FriendProfile {
  if (
    !isRecord(value) ||
    typeof value.displayName !== 'string' ||
    typeof value.signature !== 'string' ||
    typeof value.userId !== 'string'
  ) {
    throw new Error('好友资料格式无效');
  }
  return { displayName: value.displayName, signature: value.signature, userId: value.userId };
}

export function parseFriendListItem(value: unknown): FriendListItem {
  if (
    !isRecord(value) ||
    typeof value.createdAt !== 'string' ||
    typeof value.relationshipId !== 'string'
  ) {
    throw new Error('好友关系格式无效');
  }
  return {
    createdAt: value.createdAt,
    friend: parseFriendProfile(value.friend),
    relationshipId: value.relationshipId,
  };
}
