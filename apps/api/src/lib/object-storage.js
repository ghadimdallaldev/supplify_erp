/**
 * @deprecated Import from ../services/storage/storage.service.js
 */
export {
  getStorageDriver,
  getStorageProvider,
  ensureStorageReady as ensureObjectStorageBuckets,
  checkStorageHealth as checkObjectStorageHealth,
  createPresignedUpload,
  buildObjectPublicUrl,
} from '../services/storage/storage.service.js'
