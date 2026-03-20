import "dotenv/config";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import fs from "fs";

const bucket = process.env.YANDEX_STORAGE_BUCKET;

if (!bucket) {
  throw new Error("YANDEX_STORAGE_BUCKET не задан в .env");
}

console.log("YANDEX STORAGE INIT", {
  bucket,
  endpoint: process.env.YANDEX_STORAGE_ENDPOINT,
  region: process.env.YANDEX_STORAGE_REGION,
  accessKey: process.env.YANDEX_ACCESS_KEY_ID ? "OK" : "MISSING",
  secretKey: process.env.YANDEX_SECRET_ACCESS_KEY ? "OK" : "MISSING",
});

export const s3 = new S3Client({
  region: process.env.YANDEX_STORAGE_REGION || "ru-central1",
  endpoint: process.env.YANDEX_STORAGE_ENDPOINT || "https://storage.yandexcloud.net",
  credentials: {
    accessKeyId: process.env.YANDEX_ACCESS_KEY_ID,
    secretAccessKey: process.env.YANDEX_SECRET_ACCESS_KEY,
  },
});

export async function uploadFileToStorage(filePath, key, contentType) {
  try {
    const body = fs.readFileSync(filePath);

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );

    return {
      key,
      url: `https://storage.yandexcloud.net/${bucket}/${key}`,
    };
  } catch (error) {
    console.error("UPLOAD ERROR:", error);
    throw error;
  }
}

export async function deleteFileFromStorage(key) {
  if (!key) return;

  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}