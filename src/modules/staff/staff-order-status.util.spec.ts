import {
  preferAuthoritativeLifecycleStatus,
  resolveListEntryStatus,
  staffOrderStatusLifecycleRank,
} from './staff-order-status.util';

describe('preferAuthoritativeLifecycleStatus', () => {
  it('keeps confirmed ahead of pending overlay', () => {
    expect(preferAuthoritativeLifecycleStatus('confirmed', 'pending')).toBe(
      'confirmed',
    );
    expect(preferAuthoritativeLifecycleStatus('pending', 'confirmed')).toBe(
      'confirmed',
    );
  });

  it('keeps prepared ahead of confirmed', () => {
    expect(preferAuthoritativeLifecycleStatus('prepared', 'confirmed')).toBe(
      'prepared',
    );
  });

  it('ranks lifecycle stages in order', () => {
    expect(staffOrderStatusLifecycleRank('pending')).toBeLessThan(
      staffOrderStatusLifecycleRank('confirmed'),
    );
    expect(staffOrderStatusLifecycleRank('confirmed')).toBeLessThan(
      staffOrderStatusLifecycleRank('prepared'),
    );
  });
});

describe('resolveListEntryStatus', () => {
  it('uses actionDetails when top-level status is missing', () => {
    expect(
      resolveListEntryStatus({
        actionDetails: [
          { status: 'pending' },
          { status: 'confirmed' },
        ],
      }),
    ).toBe('confirmed');
  });
});
