import './load-env';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function readPort(): number {
  const raw = process.env.PORT ?? '43124';
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a positive integer, got ${raw}`);
  }
  return port;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // The page is on another port, so the browser needs CORS.
  // Same-machine dev uses both 127.0.0.1 and localhost.
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:43123';
  const origins = Array.from(
    new Set([webOrigin, 'http://127.0.0.1:43123', 'http://localhost:43123']),
  );
  app.enableCors({ origin: origins });

  const port = readPort();
  await app.listen(port, '0.0.0.0');
  Logger.log(`API listening on http://127.0.0.1:${port}`, 'Bootstrap');
}

void bootstrap();
