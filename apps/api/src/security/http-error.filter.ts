import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

@Catch(HttpException)
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse();
    if (status === 429 && typeof body === 'object' && 'retryAfter' in body) {
      response.setHeader('Retry-After', String(body.retryAfter));
    }
    response.status(status).json(typeof body === 'string' ? { statusCode: status, message: body } : body);
  }
}
