import { Injectable } from '@nestjs/common';
import { S3 } from 'aws-sdk';

import { createLogger } from '@supplify/utils';

const logger = createLogger('images-service');

@Injectable()
export class ImagesService {
  private s3: S3;
  private bucketName: string;

  constructor() {
    this.bucketName = process.env.S3_BUCKET || 'supplify-assets-dev';
    
    this.s3 = new S3({
      region: process.env.AWS_REGION || 'eu-central-1',
      endpoint: process.env.AWS_ENDPOINT,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      s3ForcePathStyle: true, // Required for LocalStack
    });
  }

  async getUploadUrl(productId: string, fileName: string, contentType: string) {
    const key = `products/${productId}/${Date.now()}-${fileName}`;
    
    const url = await this.s3.getSignedUrlPromise('putObject', {
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
      Expires: 300, // 5 minutes
    });

    logger.info(`Generated upload URL for: ${key}`);

    return {
      uploadUrl: url,
      key,
      expiresIn: 300,
    };
  }

  async getImageUrl(key: string): Promise<string> {
    // In production with CloudFront, return CDN URL
    if (process.env.CLOUDFRONT_DOMAIN) {
      return `https://${process.env.CLOUDFRONT_DOMAIN}/${key}`;
    }

    // For development with LocalStack
    return `${process.env.AWS_ENDPOINT || 'http://localhost:4566'}/${this.bucketName}/${key}`;
  }

  async deleteImage(key: string): Promise<void> {
    await this.s3.deleteObject({
      Bucket: this.bucketName,
      Key: key,
    }).promise();

    logger.info(`Deleted image: ${key}`);
  }
}

