import { staffInvalidChannelScopeResult } from './staff-order-errors.util';
import { parseStaffOrderListChannel } from './staff-order-channel.util';

describe('archive channel/scope contract', () => {
  it('parseStaffOrderListChannel accepts all', () => {
    expect(parseStaffOrderListChannel('all')).toBe('all');
    expect(parseStaffOrderListChannel('delivery')).toBe('delivery');
    expect(parseStaffOrderListChannel('table')).toBe('table');
  });

  it('staffInvalidChannelScopeResult is 400 INVALID_CHANNEL_SCOPE', () => {
    const result = staffInvalidChannelScopeResult();
    expect(result.status).toBe(400);
    expect((result.data as { code?: string }).code).toBe(
      'INVALID_CHANNEL_SCOPE',
    );
  });
});
