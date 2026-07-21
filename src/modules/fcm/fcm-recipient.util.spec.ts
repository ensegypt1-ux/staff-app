import { deviceShouldReceivePush } from './fcm-recipient.util';

describe('fcm-recipient.util', () => {
  it('requires delivery:view for delivery new_call', () => {
    expect(
      deviceShouldReceivePush({
        permissions: ['orders:view', 'orders:confirm'],
        kind: 'new_call',
        channel: 'delivery',
      }),
    ).toBe(false);
    expect(
      deviceShouldReceivePush({
        permissions: ['delivery:view'],
        kind: 'new_call',
        channel: 'delivery',
      }),
    ).toBe(true);
  });

  it('requires orders:view and confirm|prepare for table new_call', () => {
    expect(
      deviceShouldReceivePush({
        permissions: ['orders:view'],
        kind: 'new_call',
        channel: 'table',
      }),
    ).toBe(false);
    expect(
      deviceShouldReceivePush({
        permissions: ['orders:view', 'orders:prepare'],
        kind: 'new_call',
        channel: 'table',
      }),
    ).toBe(true);
  });

  it('requires orders:confirm for attention kinds', () => {
    expect(
      deviceShouldReceivePush({
        permissions: ['orders:view'],
        kind: 'bill',
        channel: 'table',
      }),
    ).toBe(false);
    expect(
      deviceShouldReceivePush({
        permissions: ['orders:confirm'],
        kind: 'waiter_request',
        channel: 'table',
      }),
    ).toBe(true);
  });
});
