import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('LYN Licitaciones API')
    .setDescription(
      'Plataforma de búsqueda y gestión de licitaciones públicas - LYN Soluciones Tecnológicas',
    )
    .setVersion('0.1.0')
    .addTag('tenders', 'Gestión de licitaciones')
    .addTag('sources', 'Fuentes de datos')
    .addTag('board', 'Tablero Kanban')
    .addTag('company', 'Perfil de empresa')
    .addTag('search', 'Búsqueda vectorial')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`LYN Licitaciones API running on port ${port}`);
  console.log(`Swagger docs: http://localhost:${port}/docs`);
}
bootstrap();
