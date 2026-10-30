'use strict';

const FILE_BATCH_SIZE = 50;
const TEMP_URL_MAX_AGE_SECONDS = 300;

function isSuccess(result) {
  return (
    result &&
    (result.status === undefined || result.status === 0) &&
    (result.code === undefined || [0, '', 'SUCCESS'].includes(result.code)) &&
    (result.errCode === undefined || result.errCode === 0) &&
    !(typeof result.errMsg === 'string' && result.errMsg.includes(':fail'))
  );
}

function orderedResults(result, fileIds) {
  if (!isSuccess(result) || !Array.isArray(result.fileList))
    throw new Error('Cloud file request failed');
  const byId = new Map(result.fileList.map((item) => [item.fileID, item]));
  return fileIds.map((fileId) => {
    const item = byId.get(fileId);
    if (!isSuccess(item)) throw new Error('Cloud file operation failed');
    return item;
  });
}

function createCloudStorageService(cloud) {
  return {
    async deleteFiles(fileIds) {
      const unique = [...new Set(fileIds)];
      let failed = false;
      for (let offset = 0; offset < unique.length; offset += FILE_BATCH_SIZE) {
        const batch = unique.slice(offset, offset + FILE_BATCH_SIZE);
        try {
          orderedResults(await cloud.deleteFile({ fileList: batch }), batch);
        } catch {
          failed = true;
        }
      }
      if (failed) throw new Error('Some cloud files could not be deleted');
    },
    async getTempUrls(fileIds) {
      const urls = [];
      for (let offset = 0; offset < fileIds.length; offset += FILE_BATCH_SIZE) {
        const batch = fileIds.slice(offset, offset + FILE_BATCH_SIZE);
        const result = await cloud.getTempFileURL({
          fileList: batch.map((fileID) => ({ fileID, maxAge: TEMP_URL_MAX_AGE_SECONDS })),
        });
        urls.push(
          ...orderedResults(result, batch).map((item) => {
            if (typeof item.tempFileURL !== 'string' || !item.tempFileURL.startsWith('https://')) {
              throw new Error('Cloud image URL unavailable');
            }
            return item.tempFileURL;
          }),
        );
      }
      return urls;
    },
  };
}

module.exports = { createCloudStorageService };
