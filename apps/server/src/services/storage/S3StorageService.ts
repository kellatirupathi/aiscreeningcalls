import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../../config/env.js";

export class S3StorageService {
  private client: S3Client;
  private bucket: string;
  private prefix: string;
  private region: string;

  constructor() {
    this.region = env.AWS_REGION ?? "ap-south-1";
    this.bucket = env.AWS_BUCKET_NAME ?? "";
    this.prefix = env.AWS_BUCKET_PREFIX ?? "dev";

    this.client = new S3Client({
      region: this.region,
      ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: env.AWS_ACCESS_KEY_ID,
              secretAccessKey: env.AWS_SECRET_ACCESS_KEY
            }
          }
        : {})
    });
  }

  private buildKey(subKey: string): string {
    return `${this.prefix}/${subKey}`;
  }

  private buildUrl(key: string): string {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  async uploadBuffer(subKey: string, buffer: Buffer, contentType: string): Promise<string> {
    if (!this.bucket) {
      throw new Error("AWS_BUCKET_NAME is not configured.");
    }

    const key = this.buildKey(subKey);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType
      })
    );

    return this.buildUrl(key);
  }

  /**
   * Downloads audio from a provider's recording URL and uploads it to S3.
   * Returns the public S3 URL.
   */
  async uploadFromUrl(sourceUrl: string, subKey: string): Promise<string> {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Failed to download recording from ${sourceUrl}: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "audio/mpeg";
    return this.uploadBuffer(subKey, buffer, contentType);
  }

  async uploadRecording(callId: string, buffer: Buffer): Promise<string> {
    return this.uploadBuffer(`recordings/${callId}.mp3`, buffer, "audio/mpeg");
  }

  async uploadRecordingFromUrl(callId: string, sourceUrl: string): Promise<string> {
    return this.uploadFromUrl(sourceUrl, `recordings/${callId}.mp3`);
  }
}
