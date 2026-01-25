const { S3Client, HeadBucketCommand, CreateBucketCommand, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

async function createS3Endpoint({ endpoint, region, bucket, accessKeyId, secretAccessKey, forcePathStyle } = {}) {
  const safeEndpoint = String(endpoint || '').trim();
  const safeBucket = String(bucket || '').trim();
  const safeAccessKeyId = String(accessKeyId || '').trim();
  const safeSecret = String(secretAccessKey || '').trim();

  if (!safeEndpoint || !safeBucket || !safeAccessKeyId || !safeSecret) {
    const err = new Error('Invalid S3 endpoint config');
    err.code = 'INVALID_S3_CONFIG';
    throw err;
  }

  const client = new S3Client({
    endpoint: safeEndpoint,
    region: String(region || 'us-east-1').trim() || 'us-east-1',
    credentials: {
      accessKeyId: safeAccessKeyId,
      secretAccessKey: safeSecret,
    },
    forcePathStyle: Boolean(forcePathStyle),
  });

  async function ensureBucket() {
    try {
      await client.send(new HeadBucketCommand({ Bucket: safeBucket }));
      return { ok: true, bucket: safeBucket, ensured: false };
    } catch (e) {
      const status = e?.$metadata?.httpStatusCode;
      if (status !== 404 && e?.name !== 'NotFound') throw e;
      await client.send(new CreateBucketCommand({ Bucket: safeBucket }));
      return { ok: true, bucket: safeBucket, ensured: true };
    }
  }

  return {
    type: 's3',
    endpoint: safeEndpoint,
    bucket: safeBucket,

    async testWritable() {
      await ensureBucket();
      const key = `__migration_test__/${Date.now()}_${Math.random().toString(16).slice(2)}`;
      await client.send(new PutObjectCommand({ Bucket: safeBucket, Key: key, Body: Buffer.from('ok') }));
      return { ok: true, bucket: safeBucket, endpoint: safeEndpoint };
    },

    async getObject({ key }) {
      const response = await client.send(new GetObjectCommand({ Bucket: safeBucket, Key: key }));
      const chunks = [];
      for await (const chunk of response.Body) chunks.push(chunk);
      return { body: Buffer.concat(chunks), contentType: response.ContentType || null };
    },

    async putObject({ key, body, contentType }) {
      await ensureBucket();
      await client.send(new PutObjectCommand({
        Bucket: safeBucket,
        Key: key,
        Body: body,
        ContentType: contentType || undefined,
      }));
      return { ok: true, bucket: safeBucket, key };
    },

    describeKey(key) {
      return `s3://${safeBucket}/${key}`;
    },
  };
}

module.exports = {
  createS3Endpoint,
};
