import { SetMetadata } from '@nestjs/common';

export const PUBLIC_KEY = 'isPublic';
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_KEY, true);
