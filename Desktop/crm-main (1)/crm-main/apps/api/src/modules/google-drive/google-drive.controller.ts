import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsArray } from 'class-validator';
import { GoogleDriveService, ParsedDriveFile } from './google-drive.service';

class ParseUrlDto {
  @IsString()
  @IsNotEmpty()
  url: string;
}

class ParseMultipleUrlsDto {
  @IsArray()
  @IsString({ each: true })
  urls: string[];
}

@ApiTags('Google Drive')
@Controller('google-drive')
export class GoogleDriveController {
  constructor(private readonly googleDriveService: GoogleDriveService) {}

  @Post('parse')
  @ApiOperation({ summary: 'Parse Google Drive URL/ID to get file info' })
  parseUrl(@Body() dto: ParseUrlDto): ParsedDriveFile | { error: string } {
    console.log('Received URL to parse:', dto.url);
    const result = this.googleDriveService.parseFileUrl(dto.url);
    console.log('Parse result:', result);
    if (!result) {
      return { error: 'Invalid Google Drive URL or file ID' };
    }
    return result;
  }

  @Post('parse-multiple')
  @ApiOperation({ summary: 'Parse multiple Google Drive URLs/IDs' })
  parseMultiple(@Body() dto: ParseMultipleUrlsDto): ParsedDriveFile[] {
    return this.googleDriveService.parseMultiple(dto.urls);
  }
}
