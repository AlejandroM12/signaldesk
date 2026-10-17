import "./newrelic-preload";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { readListenTarget } from "./listen-address";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.enableCors({
    origin: config.getOrThrow<string>("CORS_ORIGIN"),
    exposedHeaders: ["X-Request-Id"],
  });
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const listenTarget = readListenTarget({
    PORT: process.env.PORT,
    API_PORT: process.env.API_PORT,
  });
  await app.listen(listenTarget.port, listenTarget.host);
}

void bootstrap();
