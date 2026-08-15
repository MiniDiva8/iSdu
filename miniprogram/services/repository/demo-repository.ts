import type { SkeletonRepository } from './types';

export const demoRepository: SkeletonRepository = {
  mode: 'local',
  getStatus: () =>
    Promise.resolve({
      ready: true,
      message: '本地 Repository 可用',
    }),
};
