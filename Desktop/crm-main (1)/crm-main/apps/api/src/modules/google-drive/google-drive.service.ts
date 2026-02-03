import { Injectable } from '@nestjs/common';

export interface ParsedDriveFile {
  fileId: string;
  thumbnailUrl: string;
  viewUrl: string;
}

@Injectable()
export class GoogleDriveService {
  /**
   * Parse Google Drive URL/ID and return file info
   * Supports formats:
   * - https://drive.google.com/file/d/FILE_ID/view
   * - https://drive.google.com/open?id=FILE_ID
   * - https://drive.google.com/thumbnail?id=FILE_ID
   * - https://lh3.googleusercontent.com/d/FILE_ID (thumbnail URL)
   * - Just the FILE_ID directly
   */
  parseFileUrl(input: string): ParsedDriveFile | null {
    if (!input || typeof input !== 'string') {
      return null;
    }

    // Clean input: remove whitespace, newlines, and invisible characters
    let trimmed = input.trim().replace(/[\s\u200B\u00A0]/g, '');

    // Try to decode URL-encoded strings
    try {
      trimmed = decodeURIComponent(trimmed);
    } catch {
      // If decoding fails, use original trimmed value
    }

    let fileId: string | null = null;

    // Pattern 1: /file/d/FILE_ID/ (Google Drive link)
    const filePattern = /\/file\/d\/([a-zA-Z0-9_-]+)/;
    const fileMatch = trimmed.match(filePattern);
    if (fileMatch) {
      fileId = fileMatch[1];
    }

    // Pattern 1b: lh3.googleusercontent.com/d/FILE_ID (thumbnail URL)
    if (!fileId) {
      const thumbnailPattern =
        /lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/;
      const thumbnailMatch = trimmed.match(thumbnailPattern);
      if (thumbnailMatch) {
        fileId = thumbnailMatch[1];
      }
    }

    // Pattern 2: ?id=FILE_ID
    if (!fileId) {
      const idPattern = /[?&]id=([a-zA-Z0-9_-]+)/;
      const idMatch = trimmed.match(idPattern);
      if (idMatch) {
        fileId = idMatch[1];
      }
    }

    // Pattern 3: Just the ID (alphanumeric, underscore, hyphen, typically 28-33 chars)
    if (!fileId && /^[a-zA-Z0-9_-]{20,50}$/.test(trimmed)) {
      fileId = trimmed;
    }

    if (!fileId) {
      return null;
    }

    return {
      fileId,
      thumbnailUrl: this.getThumbnailUrl(fileId),
      viewUrl: this.getViewUrl(fileId),
    };
  }

  /**
   * Get thumbnail URL for a file
   */
  getThumbnailUrl(fileId: string, size = 400): string {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`;
  }

  /**
   * Get view URL for a file
   */
  getViewUrl(fileId: string): string {
    return `https://drive.google.com/file/d/${fileId}/view`;
  }

  /**
   * Parse multiple URLs/IDs
   */
  parseMultiple(inputs: string[]): ParsedDriveFile[] {
    return inputs
      .map((input) => this.parseFileUrl(input))
      .filter((result): result is ParsedDriveFile => result !== null);
  }
}
