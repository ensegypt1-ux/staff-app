import {
  isDeliveryUpstreamRow,
  resolveStaffOrderChannel,
} from './staff-order-channel.util';

describe('resolveStaffOrderChannel', () => {
  it('detects delivery from type', () => {
    expect(resolveStaffOrderChannel({ type: 'delivery' })).toBe('delivery');
  });

  it('detects delivery from orderType', () => {
    expect(resolveStaffOrderChannel({ orderType: 'delivery' })).toBe(
      'delivery',
    );
  });

  it('detects delivery from activity log channel field', () => {
    expect(resolveStaffOrderChannel({ channel: 'delivery' })).toBe('delivery');
  });

  it('detects delivery when tableNumber is empty (Express delivery orders)', () => {
    expect(
      resolveStaffOrderChannel({
        tableNumber: '',
        customerName: 'Guest',
      }),
    ).toBe('delivery');
  });

  it('detects table when tableNumber is set', () => {
    expect(
      resolveStaffOrderChannel({
        type: 'table',
        tableNumber: '3',
      }),
    ).toBe('table');
  });

  it('uses list channel hint when type is ambiguous', () => {
    expect(
      resolveStaffOrderChannel({ tableNumber: '3' }, 'table'),
    ).toBe('table');
  });
});

describe('isDeliveryUpstreamRow', () => {
  it('flags stripped table-calls delivery rows', () => {
    expect(
      isDeliveryUpstreamRow({
        id: 1,
        tableNumber: '',
        customerName: 'Online guest',
        status: 'pending',
      }),
    ).toBe(true);
  });

  it('does not flag table pending calls', () => {
    expect(
      isDeliveryUpstreamRow({
        id: 2,
        tableNumber: '7',
        customerName: 'Guest',
        status: 'pending',
      }),
    ).toBe(false);
  });
});
