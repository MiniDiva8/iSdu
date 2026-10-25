import type { FriendInvite, FriendInvitePreview, FriendListItem } from '../../models/cloud-friend';

export interface FriendRepository {
  acceptInvite(token: string): Promise<FriendListItem>;
  createInvite(): Promise<FriendInvite>;
  listFriends(): Promise<FriendListItem[]>;
  removeFriend(friendUserId: string): Promise<void>;
  resolveInvite(token: string): Promise<FriendInvitePreview>;
}
