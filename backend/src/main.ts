import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';

import { AppModule } from './app.module';
import { AuditExceptionFilter } from './audit/audit-exception.filter';
import { RequestContextService } from './audit/request-context.service';
import { extractRequestOrigin, readAllowedFrontendOrigins } from './common/utils/frontend-origins';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const requestContextService = app.get(RequestContextService);

  const port = configService.get<number>('PORT', 3000);
  const allowedOrigins = readAllowedFrontendOrigins(configService);

  app.getHttpAdapter().getInstance().set('trust proxy', true);
  app.setGlobalPrefix('api');

  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) =>
    requestContextService.run(req, res, next)
  );

  app.enableCors({
    origin: (requestOrigin, callback) => {
      if (!requestOrigin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = extractRequestOrigin(requestOrigin);
      callback(null, normalizedOrigin !== null && allowedOrigins.includes(normalizedOrigin));
    },
    credentials: true
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );
  app.useGlobalFilters(app.get(AuditExceptionFilter));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SFDC External API')
    .setDescription('Salesforce-integrated middleware API')
    .setVersion('0.1.0')
    .addCookieAuth('session')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port);
}

void bootstrap();
