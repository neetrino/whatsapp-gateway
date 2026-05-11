import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from './env.validation';

export type AppConfigService = ConfigService<EnvironmentVariables, true>;

export const APP_CONFIG_KEY = 'app';
