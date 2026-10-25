export interface RepositoryStatus {
  readonly ready: boolean;
  readonly message: string;
}

export interface SkeletonRepository {
  readonly mode: 'local';
  getStatus(): Promise<RepositoryStatus>;
}
