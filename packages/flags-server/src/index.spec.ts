import { of, throwError } from 'rxjs';
import { FeatureFlagsService, FlagContext } from './index';

describe('FeatureFlagsService', () => {
  const context: FlagContext = {
    env: 'dev',
    orgType: 'RESTAURANT',
    orgId: 'org-1',
    userId: 'user-1',
  };

  const createService = (handler: (pattern: string, data: unknown) => unknown) => {
    const flagsClient = {
      send: jest.fn((pattern: string, data: unknown) => of(handler(pattern, data))),
    };
    return new FeatureFlagsService(flagsClient as any);
  };

  it('returns enabled flag evaluation', async () => {
    const service = createService(() => ({ on: true, reason: 'rule_match' }));

    await expect(service.isEnabled('new-checkout', context)).resolves.toBe(true);
  });

  it('returns false when evaluation fails', async () => {
    const flagsClient = {
      send: jest.fn(() => throwError(() => new Error('rmq down'))),
    };
    const service = new FeatureFlagsService(flagsClient as any);

    await expect(service.isEnabled('new-checkout', context)).resolves.toBe(false);
  });

  it('throws when requireFlag is called for disabled flag', async () => {
    const service = createService(() => ({ on: false, reason: 'disabled' }));

    await expect(service.requireFlag('beta-feature', context)).rejects.toThrow(
      'Feature "beta-feature" is not enabled',
    );
  });

  it('evaluates all flags for a context', async () => {
    const service = createService((pattern) => {
      if (pattern === 'flags.get.all') {
        return [{ key: 'feature-a' }, { key: 'feature-b' }];
      }
      return { on: true };
    });

    const flags = await service.getAllFlags(context);
    expect(flags).toHaveLength(2);
    expect(flags[0].status).toBe('ON');
  });
});
