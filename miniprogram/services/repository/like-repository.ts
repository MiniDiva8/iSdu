export interface LikeState {
  readonly likeCount: number;
  readonly likedByMe: boolean;
}

export interface LikeRepository {
  setLiked(memoryId: string, liked: boolean): Promise<LikeState>;
}
