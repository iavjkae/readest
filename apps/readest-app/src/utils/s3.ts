import { S3Client } from '@aws-sdk/client-s3';
import {
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const S3_REGION = process.env['S3_REGION'] || 'auto';

const getEndpointInternal = (): string | undefined => {
  const v = process.env['S3_ENDPOINT_INTERNAL'] || process.env['S3_ENDPOINT'];
  return v && v.trim() ? v.trim() : undefined;
};

const getEndpointPublic = (): string | undefined => {
  const v = process.env['S3_ENDPOINT_PUBLIC'] || process.env['S3_ENDPOINT'];
  return v && v.trim() ? v.trim() : undefined;
};

const getCredentials = () => {
  const accessKeyId = process.env['S3_ACCESS_KEY_ID'];
  const secretAccessKey = process.env['S3_SECRET_ACCESS_KEY'];

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('S3 credentials are not configured (S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY)');
  }

  return { accessKeyId, secretAccessKey };
};

const shouldForcePathStyle = (endpoint?: string): boolean => {
  // Default to path-style when a custom endpoint is provided (MinIO/R2/etc).
  // Allow overriding explicitly.
  const override = process.env['S3_FORCE_PATH_STYLE'];
  if (override === 'true') return true;
  if (override === 'false') return false;
  return Boolean(endpoint);
};

const makeClient = (endpoint?: string) => {
  const credentials = getCredentials();
  return new S3Client({
    region: S3_REGION,
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle: shouldForcePathStyle(endpoint),
    credentials,
  });
};

let cachedInternalClient: S3Client | null = null;
let cachedPublicClient: S3Client | null = null;

const getInternalClient = (): S3Client => {
  if (!cachedInternalClient) {
    cachedInternalClient = makeClient(getEndpointInternal());
  }
  return cachedInternalClient;
};

const getPublicClient = (): S3Client => {
  if (!cachedPublicClient) {
    // If public endpoint is not set, fall back to internal.
    cachedPublicClient = makeClient(getEndpointPublic() ?? getEndpointInternal());
  }
  return cachedPublicClient;
};


export const s3Storage = {
  getClient: () => {
    return getInternalClient();
  },

  ensureBucket: async (bucketName: string) => {
    if (!bucketName) return;
    try {
      await getInternalClient().send(new HeadBucketCommand({ Bucket: bucketName }));
    } catch {
      try {
        await getInternalClient().send(new CreateBucketCommand({ Bucket: bucketName }));
      } catch {
        // best-effort
      }
    }
  },

  getDownloadSignedUrl: async (
    bucketName: string,
    fileKey: string,
    expiresIn: number,
  ) => {
    await s3Storage.ensureBucket(bucketName);

    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
    });
    const downloadUrl = await getSignedUrl(getPublicClient(), getCommand, {
      expiresIn: expiresIn,
    });
    return downloadUrl;
  },

  getUploadSignedUrl: async (
    bucketName: string,
    fileKey: string,
    contentLength: number,
    expiresIn: number,
  ) => {

    await s3Storage.ensureBucket(bucketName);

    const signableHeaders = new Set<string>();
    signableHeaders.add('content-length');
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
      ContentLength: contentLength,
    });

    const uploadUrlSigned = await getSignedUrl(getPublicClient(), putCommand, {
      expiresIn: expiresIn,
      signableHeaders,
    });

    return uploadUrlSigned;
  },

  deleteObject: async (bucketName: string, fileKey: string) => {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
    });

    await s3Storage.ensureBucket(bucketName);
    return await getInternalClient().send(deleteCommand);
  },
};
