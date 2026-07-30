import type { SkeletonRepository } from './types';

export const demoRepository: SkeletonRepository = {
  mode: 'demo',
  getStatus: () =>
    Promise.resolve({
      ready: true,
      message: '本地 Demo 占位仓库可用',
    }),
};
