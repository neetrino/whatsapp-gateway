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

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV!: NodeEnv;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT!: number;

  @IsUrl({ require_tld: false, require_protocol: true })
  APP_URL!: string;

  @IsUrl({ require_tld: false, require_protocol: true })
  GATEWAY_PUBLIC_URL!: string;

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

  /** WAHA Core allows only one session named `default`. Set this for Core; omit for WAHA Plus (per-account DB session names). */
  @IsString()
  @IsOptional()
  WAHA_SESSION_NAME?: string;

  @IsString()
  @IsOptional()
  WAHA_WEBHOOK_SECRET?: string;

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
}

export const validateEnv = (raw: Record<string, unknown>): EnvironmentVariables => {
  const validated = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const formatted = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }
  return validated;
};
