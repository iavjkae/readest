import { S3Client } from '@aws-sdk/client-s3';
import {
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const S3_ENDPOINT_INTERNAL = process.env['S3_ENDPOINT_INTERNAL'] || process.env['S3_ENDPOINT'] || '';
const S3_ENDPOINT_PUBLIC = process.env['S3_ENDPOINT_PUBLIC'] || process.env['S3_ENDPOINT'] || S3_ENDPOINT_INTERNAL;
const S3_REGION = process.env['S3_REGION'] || 'auto';
const S3_ACCESS_KEY_ID = process.env['S3_ACCESS_KEY_ID'] || '';
const S3_SECRET_ACCESS_KEY = process.env['S3_SECRET_ACCESS_KEY'] || '';

const makeClient = (endpoint: string) =>
  new S3Client({
    forcePathStyle: true,
    region: S3_REGION,
    endpoint,
    credentials: {
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
    },
  });

// Used only for signing URLs returned to browsers.
export const s3PublicClient = makeClient(S3_ENDPOINT_PUBLIC);

// Used for server-side operations (bucket checks/deletes).
export const s3InternalClient = makeClient(S3_ENDPOINT_INTERNAL);


export const s3Storage = {
  getClient: () => {
    return s3InternalClient;
  },

  ensureBucket: async (bucketName: string) => {
    if (!bucketName) return;
    try {
      await s3InternalClient.send(new HeadBucketCommand({ Bucket: bucketName }));
    } catch {
      try {
        await s3InternalClient.send(new CreateBucketCommand({ Bucket: bucketName }));
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
    const downloadUrl = await getSignedUrl(s3PublicClient, getCommand, {
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

    const uploadUrl = await getSignedUrl(s3PublicClient, putCommand, {
      expiresIn: expiresIn,
      signableHeaders,
    });

    return uploadUrl;
  },

  deleteObject: async (bucketName: string, fileKey: string) => {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
    });

    await s3Storage.ensureBucket(bucketName);
    return await s3InternalClient.send(deleteCommand);
  },
};
