import {
  inferChannelFromPayload,
  mapAttentionChangedEvent,
  mapNewTableCallEvent,
} from './fcm-event.mapper';

describe('fcm-event.mapper', () => {
  it('maps new_call with stable eventId', () => {
    const mapped = mapNewTableCallEvent({
      id: 99,
      menuId: 12,
      tableNumber: '5',
      at: '2026-07-21T10:00:00.000Z',
    });
    expect(mapped).toEqual({
      menuId: 12,
      staffCallId: 99,
      kind: 'new_call',
      channel: 'table',
      eventId: 'fcm:12:99:new_call:2026-07-21T10:00:00.000Z',
      at: '2026-07-21T10:00:00.000Z',
      tableNumber: '5',
      customerName: undefined,
    });
  });

  it('infers delivery from empty tableNumber', () => {
    expect(
      inferChannelFromPayload({ tableNumber: '', customerName: 'Ali' }),
    ).toBe('delivery');
  });

  it('maps guest_add attention only', () => {
    const mapped = mapAttentionChangedEvent({
      id: 1,
      menuId: 2,
      tableNumber: '3',
      pendingGuestAddition: true,
      at: 't1',
    });
    expect(mapped?.kind).toBe('guest_add');
  });

  it('skips routine status changes', () => {
    expect(
      mapAttentionChangedEvent({
        id: 1,
        menuId: 2,
        tableNumber: '3',
        status: 'confirmed',
        at: 't1',
      }),
    ).toBeNull();
  });
});
