import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Staff BFF health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.PORT = '3010';
    process.env.NODE_ENV = 'test';
    process.env.ENS_BACKEND_URL = 'http://127.0.0.1:4021';
    process.env.ASSET_PUBLIC_BASE_URL = 'http://127.0.0.1:4021';
    process.env.CORS_ORIGINS = '*';
    process.env.SECRET_KEY = 'test-secret-key-for-e2e';
    process.env.UPSTREAM_DEBUG_LOG = 'false';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live', () => {
    return request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('GET /staff/v1/health', () => {
    return request(app.getHttpServer())
      .get('/staff/v1/health')
      .expect(200)
      .expect({ status: 'ok', service: 'ensmenu-staff-bff' });
  });

  it('POST /staff/v1/auth/login without body returns upstream error', () => {
    return request(app.getHttpServer())
      .post('/staff/v1/auth/login')
      .send({})
      .expect((res) => {
        expect(res.status).toBeGreaterThanOrEqual(400);
      });
  });
});
