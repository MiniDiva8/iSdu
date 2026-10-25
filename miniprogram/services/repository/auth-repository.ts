import type {
  AuthBootstrapResult,
  CloudUserProfile,
  CloudUserProfileInput,
} from '../../models/cloud-user';

export interface AuthRepository {
  bootstrap(): Promise<AuthBootstrapResult>;
  deleteCloudAccount(): Promise<{ readonly deleted: true; readonly orphanFileCount: number }>;
  getMyProfile(): Promise<CloudUserProfile>;
  updateMyProfile(input: CloudUserProfileInput): Promise<CloudUserProfile>;
}
