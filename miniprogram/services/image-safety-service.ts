export const SAFETY_IMAGE_MAX_BYTES = 900 * 1024;
export const SAFETY_IMAGE_MAX_WIDTH = 750;
export const SAFETY_IMAGE_MAX_HEIGHT = 1334;
export const SAFETY_IMAGE_MAX_SIZE_LABEL = '900 KB';

function getImageInfo(src: string): Promise<{ readonly height: number; readonly width: number }> {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src,
      success: (result) => resolve({ height: result.height, width: result.width }),
      fail: () => reject(new Error('无法读取照片尺寸，请重新选择')),
    });
  });
}

function getFileSize(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().getFileInfo({
      filePath,
      success: (result) => resolve(result.size),
      fail: () => reject(new Error('无法读取压缩后的照片')),
    });
  });
}

function compressImage(
  src: string,
  width: number,
  height: number,
  quality: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.compressImage({
      compressedHeight: height,
      compressedWidth: width,
      quality,
      src,
      success: (result) => resolve(result.tempFilePath),
      fail: () => reject(new Error('照片压缩失败')),
    });
  });
}

export async function prepareImageForSafety(src: string): Promise<string> {
  if (!src) {
    throw new Error('照片路径无效，请重新选择');
  }

  const [{ height, width }, originalSize] = await Promise.all([
    getImageInfo(src),
    getFileSize(src),
  ]);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(originalSize) ||
    originalSize <= 0
  ) {
    throw new Error('照片信息无效，请重新选择');
  }

  if (
    width <= SAFETY_IMAGE_MAX_WIDTH &&
    height <= SAFETY_IMAGE_MAX_HEIGHT &&
    originalSize <= SAFETY_IMAGE_MAX_BYTES
  ) {
    return src;
  }

  const scale = Math.min(1, SAFETY_IMAGE_MAX_WIDTH / width, SAFETY_IMAGE_MAX_HEIGHT / height);
  const compressedWidth = Math.max(1, Math.floor(width * scale));
  const compressedHeight = Math.max(1, Math.floor(height * scale));
  let compressed = await compressImage(src, compressedWidth, compressedHeight, 65);
  if ((await getFileSize(compressed)) > SAFETY_IMAGE_MAX_BYTES) {
    compressed = await compressImage(compressed, compressedWidth, compressedHeight, 35);
  }
  if ((await getFileSize(compressed)) > SAFETY_IMAGE_MAX_BYTES) {
    throw new Error('照片压缩后仍然过大，请选择较小的照片');
  }
  return compressed;
}
