import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { createWmsApp } from '../src/bootstrap';

async function main() {
  const app = await createWmsApp({ enableSwagger: false });
  const config = new DocumentBuilder()
    .setTitle('Aardvarkland API')
    .setDescription('Backend API pro Aardvarkland.')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const output = resolve(process.cwd(), 'openapi.json');

  await writeFile(output, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await app.close();
  console.log(`OpenAPI document written to ${output}`);
}

void main();
