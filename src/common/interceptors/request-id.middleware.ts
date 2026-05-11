import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ulid } from 'ulid';

export interface RequestWithId extends Request {
  requestId: string;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header('x-request-id');
    const id = incoming && /^[A-Za-z0-9_-]{1,100}$/.test(incoming) ? incoming : `req_${ulid()}`;
    (req as RequestWithId).requestId = id;
    res.setHeader('x-request-id', id);
    next();
  }
}
