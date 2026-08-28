import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

const DEFAULTS: Record<string, unknown> = {
  PORT: 3000,
  GATEWAY_INTERNAL_URL: 'http://gateway:3000',
  API_TOKEN_PREFIX: 'gw_live',
  MAX_TEXT_LENGTH: 4096,
  MAX_CAPTION_LENGTH: 4096,
  MAX_IMAGE_SIZE_MB: 10,
  MAX_VIDEO_SIZE_MB: 50,
  MAX_CHATS_PAGE: 100,
  MAX_MESSAGES_PAGE: 100,
  RATE_LIMIT_SEND: 1200,
  RATE_LIMIT_V1_SEND: 1200,
  RATE_LIMIT_V1_READ: 2400,
  WEBHOOK_DELIVERY_TIMEOUT_MS: 10_000,
};

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV!: NodeEnv;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT!: number;

  @IsUrl({ require_tld: false, require_protocol: true })
  APP_URL!: string;

  @IsString()
  @MinLength(10)
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32, { message: 'COOKIE_SECRET must be at least 32 characters' })
  COOKIE_SECRET!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET must be at least 32 characters' })
  JWT_SECRET!: string;

  @IsString()
  @MinLength(32, { message: 'TOKEN_PEPPER must be at least 32 characters' })
  TOKEN_PEPPER!: string;

  @IsUrl({ require_tld: false, require_protocol: true })
  WAHA_BASE_URL!: string;

  @IsString()
  @IsOptional()
  WAHA_API_KEY?: string;

  @IsString()
  @MinLength(32, { message: 'WAHA_WEBHOOK_SECRET must be at least 32 characters' })
  WAHA_WEBHOOK_SECRET!: string;

  @IsUrl({ require_tld: false, require_protocol: true })
  GATEWAY_INTERNAL_URL!: string;

  @IsString()
  @MinLength(2)
  API_TOKEN_PREFIX!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  MAX_TEXT_LENGTH!: number;

  @IsInt()
  @Min(1)
  @Max(512)
  MAX_IMAGE_SIZE_MB!: number;

  @IsInt()
  @Min(1)
  @Max(2048)
  MAX_VIDEO_SIZE_MB!: number;

  @IsInt()
  @Min(1)
  @Max(65535)
  MAX_CAPTION_LENGTH!: number;

  @IsInt()
  @Min(1)
  RATE_LIMIT_SEND!: number;

  @IsInt()
  @Min(1)
  RATE_LIMIT_V1_SEND!: number;

  @IsInt()
  @Min(1)
  RATE_LIMIT_V1_READ!: number;

  @IsInt()
  @Min(1)
  @Max(500)
  MAX_CHATS_PAGE!: number;

  @IsInt()
  @Min(1)
  @Max(500)
  MAX_MESSAGES_PAGE!: number;

  @IsInt()
  @Min(1_000)
  @Max(120_000)
  WEBHOOK_DELIVERY_TIMEOUT_MS!: number;
}

export const validateEnv = (raw: Record<string, unknown>): EnvironmentVariables => {
  const validated = plainToInstance(
    EnvironmentVariables,
    { ...DEFAULTS, ...raw },
    { enableImplicitConversion: true },
  );
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const formatted = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }
  return validated;
};
