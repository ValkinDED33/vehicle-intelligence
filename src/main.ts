import { existsSync } from "fs";
import { join } from "path";

import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { type NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module";
import { UuidRouteParamsPipe } from "./common/pipes/uuid-route-params.pipe";

const DEFAULT_CORS_ORIGINS =
  "http://localhost:5173,http://127.0.0.1:5173,https://vehicle-intelligence-nu.vercel.app";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(
    new UuidRouteParamsPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsOrigins = (process.env.CORS_ORIGINS ?? DEFAULT_CORS_ORIGINS)
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  app.enableCors({ origin: corsOrigins });

  // Serve the compiled SPA from the backend so the whole product ships as a
  // single origin (no CORS, one deployable). API routes still take precedence:
  // express.static only answers when a matching file exists, otherwise the
  // request falls through to the Nest router.
  const frontendDist = join(__dirname, "..", "frontend", "dist");

  if (existsSync(frontendDist)) {
    app.useStaticAssets(frontendDist, { index: ["index.html"] });

    Logger.log(`Serving frontend from ${frontendDist}`, "Bootstrap");
  } else {
    Logger.warn(
      `Frontend build not found at ${frontendDist} — run "npm run build:web"`,
      "Bootstrap",
    );
  }

  const port = Number(process.env.PORT) || 3000;

  await app.listen(port);

  Logger.log(`Vehicle Intelligence API listening on port ${port}`, "Bootstrap");
}

void bootstrap();
