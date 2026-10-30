'use strict';

function successful(result) {
  return (
    result &&
    (result.status === undefined || result.status === 0) &&
    (result.code === undefined || [0, '', 'SUCCESS'].includes(result.code)) &&
    (result.errCode === undefined || result.errCode === 0) &&
    !(typeof result.errMsg === 'string' && result.errMsg.includes(':fail'))
  );
}

function createDeleteFiles(cloud) {
  return async (fileIds) => {
    const unique = [...new Set(fileIds)];
    let failed = false;
    for (let offset = 0; offset < unique.length; offset += 50) {
      const batch = unique.slice(offset, offset + 50);
      try {
        const result = await cloud.deleteFile({ fileList: batch });
        if (!successful(result) || !Array.isArray(result.fileList))
          throw new Error('Storage deletion failed');
        const byId = new Map(result.fileList.map((item) => [item.fileID, item]));
        if (batch.some((fileId) => !successful(byId.get(fileId))))
          throw new Error('Storage deletion incomplete');
      } catch {
        failed = true;
      }
    }
    if (failed) throw new Error('Some account files could not be deleted');
  };
}

module.exports = { createDeleteFiles };
