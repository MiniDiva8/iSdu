import type {
  AuthBootstrapResult,
  CloudUserProfile,
  CloudUserProfileInput,
} from '../../models/cloud-user';

export interface AuthRepository {
  bootstrap(): Promise<AuthBootstrapResult>;
  getMyProfile(): Promise<CloudUserProfile>;
  updateMyProfile(input: CloudUserProfileInput): Promise<CloudUserProfile>;
}
