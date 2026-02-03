import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface UploadedFile {
  url: string;
  fileName: string;
  originalName: string;
  size: number;
  uploadedAt: string;
}

@Injectable()
export class SupabaseStorageService {
  private supabase: SupabaseClient;
  private bucketName = 'design-files';

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async ensureBucketExists(): Promise<void> {
    const { data: buckets, error: listError } = await this.supabase.storage.listBuckets();

    if (listError) {
      console.error('Error listing buckets:', listError);
      // Continue anyway - bucket might exist
    }

    const exists = buckets?.some((b) => b.name === this.bucketName);

    if (!exists) {
      const { error: createError } = await this.supabase.storage.createBucket(this.bucketName, {
        public: true,
        fileSizeLimit: 10 * 1024 * 1024, // 10MB
      });

      if (createError) {
        console.error('Error creating bucket:', createError);
        console.log('Please create bucket "design-files" manually in Supabase Dashboard > Storage');
      }
    }
  }

  async uploadFile(
    file: MulterFile,
    folder: string = 'uploads',
  ): Promise<UploadedFile> {
    await this.ensureBucketExists();

    const timestamp = Date.now();
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${folder}/${timestamp}_${sanitizedName}`;

    const { error } = await this.supabase.storage
      .from(this.bucketName)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }

    const {
      data: { publicUrl },
    } = this.supabase.storage.from(this.bucketName).getPublicUrl(fileName);

    return {
      url: publicUrl,
      fileName,
      originalName: file.originalname,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    };
  }

  async uploadMultipleFiles(
    files: MulterFile[],
    folder: string = 'uploads',
  ): Promise<UploadedFile[]> {
    const results: UploadedFile[] = [];

    for (const file of files) {
      const result = await this.uploadFile(file, folder);
      results.push(result);
    }

    return results;
  }

  async deleteFile(fileName: string): Promise<void> {
    const { error } = await this.supabase.storage
      .from(this.bucketName)
      .remove([fileName]);

    if (error) {
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  getPublicUrl(fileName: string): string {
    const {
      data: { publicUrl },
    } = this.supabase.storage.from(this.bucketName).getPublicUrl(fileName);
    return publicUrl;
  }
}
