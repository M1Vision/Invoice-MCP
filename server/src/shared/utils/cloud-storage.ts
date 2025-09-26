import { Buffer } from 'buffer';

// Cloud Storage Interface
export interface CloudStorageProvider {
  uploadFile(buffer: Buffer, filename: string): Promise<string>;
  deleteFile(filename: string): Promise<void>;
  getFileUrl(filename: string): Promise<string>;
}

// Simple Cloud Storage Implementation (can be extended for AWS S3, Google Cloud, etc.)
export class SimpleCloudStorage implements CloudStorageProvider {
  private baseUrl: string;
  
  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.CLOUD_STORAGE_URL || 'https://your-storage.com';
  }

  async uploadFile(buffer: Buffer, filename: string): Promise<string> {
    // For demonstration - in real implementation, upload to S3, GCS, etc.
    const uploadUrl = `${this.baseUrl}/upload`;
    
    try {
      // Simulate cloud upload - replace with actual cloud storage API
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          'Authorization': `Bearer ${process.env.CLOUD_STORAGE_TOKEN}`,
        },
        body: buffer as any, // TypeScript workaround for Buffer in fetch
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result.downloadUrl || `${this.baseUrl}/files/${filename}`;
    } catch (error) {
      console.error('Cloud upload failed:', error);
      // Fallback: return a temporary URL (not recommended for production)
      return `${this.baseUrl}/temp/${filename}`;
    }
  }

  async deleteFile(filename: string): Promise<void> {
    const deleteUrl = `${this.baseUrl}/files/${filename}`;
    
    try {
      await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${process.env.CLOUD_STORAGE_TOKEN}`,
        },
      });
    } catch (error) {
      console.error('Cloud delete failed:', error);
    }
  }

  async getFileUrl(filename: string): Promise<string> {
    return `${this.baseUrl}/files/${filename}`;
  }
}

// Supabase Storage Implementation
export class SupabaseStorage implements CloudStorageProvider {
  private supabaseUrl: string;
  private supabaseKey: string;
  private bucketName: string;

  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL || '';
    this.supabaseKey = process.env.SUPABASE_ANON_KEY || '';
    this.bucketName = process.env.SUPABASE_BUCKET || 'invoices';
  }

  async uploadFile(buffer: Buffer, filename: string): Promise<string> {
    const uploadUrl = `${this.supabaseUrl}/storage/v1/object/${this.bucketName}/${filename}`;
    
    try {
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.supabaseKey}`,
          'Content-Type': 'application/pdf',
        },
        body: buffer as any, // TypeScript workaround for Buffer in fetch
      });

      if (!response.ok) {
        throw new Error(`Supabase upload failed: ${response.statusText}`);
      }

      // Return public URL
      return `${this.supabaseUrl}/storage/v1/object/public/${this.bucketName}/${filename}`;
    } catch (error) {
      console.error('Supabase upload failed:', error);
      throw error;
    }
  }

  async deleteFile(filename: string): Promise<void> {
    const deleteUrl = `${this.supabaseUrl}/storage/v1/object/${this.bucketName}/${filename}`;
    
    try {
      await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.supabaseKey}`,
        },
      });
    } catch (error) {
      console.error('Supabase delete failed:', error);
    }
  }

  async getFileUrl(filename: string): Promise<string> {
    return `${this.supabaseUrl}/storage/v1/object/public/${this.bucketName}/${filename}`;
  }
}

// AWS S3 Storage Implementation
export class S3Storage implements CloudStorageProvider {
  private bucketName: string;
  private region: string;
  private accessKeyId: string;
  private secretAccessKey: string;

  constructor() {
    this.bucketName = process.env.AWS_S3_BUCKET || '';
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
    this.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
  }

  async uploadFile(buffer: Buffer, filename: string): Promise<string> {
    // Note: This is a simplified implementation
    // In production, use the official AWS SDK
    const uploadUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${filename}`;
    
    try {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/pdf',
          // Note: In production, use proper AWS signature v4
          'Authorization': `AWS ${this.accessKeyId}:${this.secretAccessKey}`,
        },
        body: buffer as any, // TypeScript workaround for Buffer in fetch
      });

      if (!response.ok) {
        throw new Error(`S3 upload failed: ${response.statusText}`);
      }

      return uploadUrl;
    } catch (error) {
      console.error('S3 upload failed:', error);
      throw error;
    }
  }

  async deleteFile(filename: string): Promise<void> {
    const deleteUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${filename}`;
    
    try {
      await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `AWS ${this.accessKeyId}:${this.secretAccessKey}`,
        },
      });
    } catch (error) {
      console.error('S3 delete failed:', error);
    }
  }

  async getFileUrl(filename: string): Promise<string> {
    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${filename}`;
  }
}

// Factory function to create storage provider
export function createStorageProvider(): CloudStorageProvider {
  const provider = process.env.CLOUD_STORAGE_PROVIDER || 'simple';
  
  switch (provider.toLowerCase()) {
    case 'supabase':
      return new SupabaseStorage();
    case 's3':
    case 'aws':
      return new S3Storage();
    case 'simple':
    default:
      return new SimpleCloudStorage();
  }
}

// Invoice metadata storage interface
export interface InvoiceMetadata {
  invoiceNumber: string;
  filename: string;
  downloadUrl: string;
  createdAt: string;
  total: string;
  currency: string;
  clientName: string;
  status: 'generated' | 'sent' | 'paid';
}

// Simple metadata storage (can be replaced with database)
export class MetadataStorage {
  private storage: CloudStorageProvider;
  private metadataFile = 'invoices-metadata.json';

  constructor(storage: CloudStorageProvider) {
    this.storage = storage;
  }

  async saveMetadata(metadata: InvoiceMetadata): Promise<void> {
    try {
      // Get existing metadata
      const existingData = await this.getAllMetadata();
      
      // Remove existing entry with same invoice number
      const filteredData = existingData.filter(inv => inv.invoiceNumber !== metadata.invoiceNumber);
      filteredData.push(metadata);
      
      // Save updated metadata
      const metadataJson = JSON.stringify(filteredData, null, 2);
      const buffer = Buffer.from(metadataJson, 'utf-8');
      
      await this.storage.uploadFile(buffer, this.metadataFile);
    } catch (error) {
      console.error('Error saving metadata:', error);
    }
  }

  async getAllMetadata(): Promise<InvoiceMetadata[]> {
    try {
      const metadataUrl = await this.storage.getFileUrl(this.metadataFile);
      const response = await fetch(metadataUrl);
      
      if (!response.ok) {
        return []; // File doesn't exist yet
      }
      
      const data = await response.text();
      return JSON.parse(data);
    } catch (error) {
      return []; // Return empty array if error
    }
  }

  async getMetadataByNumber(invoiceNumber: string): Promise<InvoiceMetadata | null> {
    const allMetadata = await this.getAllMetadata();
    return allMetadata.find(inv => inv.invoiceNumber === invoiceNumber) || null;
  }
}

// Global instances
export const cloudStorage = createStorageProvider();
export const metadataStorage = new MetadataStorage(cloudStorage);

// Helper functions
export async function uploadToCloudStorage(buffer: Buffer, filename: string): Promise<string> {
  return await cloudStorage.uploadFile(buffer, filename);
}

export async function saveInvoiceMetadataToCloud(metadata: InvoiceMetadata): Promise<void> {
  return await metadataStorage.saveMetadata(metadata);
}

export async function getInvoiceMetadataFromCloud(): Promise<InvoiceMetadata[]> {
  return await metadataStorage.getAllMetadata();
}
