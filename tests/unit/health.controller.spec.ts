import { HealthController } from '../../src/health/health.controller';
import { HealthService } from '../../src/health/health.service';

describe('HealthController', () => {
  it('ready returns ok without calling dependencies', () => {
    const check = jest.fn();
    const controller = new HealthController({ check } as unknown as HealthService);

    expect(controller.ready()).toEqual({ ok: true, service: 'whatsapp-gateway' });
    expect(check).not.toHaveBeenCalled();
  });
});
