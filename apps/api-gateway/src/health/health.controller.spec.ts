import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('returns ok status with service name', () => {
    const result = controller.health();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('api-gateway');
    expect(result.timestamp).toBeDefined();
    expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
  });
});
