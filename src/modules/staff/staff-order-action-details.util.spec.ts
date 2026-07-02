import {
  buildActionDetailsFromActions,
  pickRicherActionDetails,
  resolveStatusStageActorName,
  resolveWorkflowStageActors,
  staffParticipatedInActionDetails,
} from './staff-order-action-details.util';

describe('staff-order-action-details.util', () => {
  it('resolveStatusStageActorName returns null for pending', () => {
    expect(
      resolveStatusStageActorName('pending', [
        { status: 'pending', waiterName: 'Guest' },
      ]),
    ).toBeNull();
  });

  it('resolveStatusStageActorName returns confirmer, not item editor', () => {
    const actor = resolveStatusStageActorName('confirmed', [
      { action: 'TABLE_CALL_CREATED', status: 'pending', waiterName: 'Guest' },
      {
        action: 'TABLE_CALL_CONFIRMED',
        status: 'confirmed',
        waiterName: 'Alice',
      },
      {
        action: 'TABLE_CALL_ITEMS_UPDATED',
        status: 'confirmed',
        waiterName: 'Bob',
      },
    ]);
    expect(actor).toBe('Alice');
  });

  it('resolveStatusStageActorName returns preparer for prepared status', () => {
    const actor = resolveStatusStageActorName('prepared', [
      {
        action: 'TABLE_CALL_CONFIRMED',
        status: 'confirmed',
        waiterName: 'Alice',
      },
      {
        action: 'TABLE_CALL_PREPARED',
        status: 'prepared',
        waiterName: 'Bob',
      },
    ]);
    expect(actor).toBe('Bob');
  });

  it('resolveStatusStageActorName returns deliverer for delivered status', () => {
    const actor = resolveStatusStageActorName('delivered', [
      {
        action: 'TABLE_CALL_PREPARED',
        status: 'prepared',
        waiterName: 'Bob',
      },
      {
        action: 'TABLE_CALL_DELIVERED',
        status: 'delivered',
        waiterName: 'Charlie',
      },
    ]);
    expect(actor).toBe('Charlie');
  });

  it('resolveStatusStageActorName returns canceller for cancelled status', () => {
    const actor = resolveStatusStageActorName('cancelled', [
      {
        action: 'TABLE_CALL_CONFIRMED',
        status: 'confirmed',
        waiterName: 'Alice',
      },
      {
        action: 'TABLE_CALL_CANCELLED',
        status: 'cancelled',
        waiterName: 'Dave',
      },
    ]);
    expect(actor).toBe('Dave');
  });

  it('pickRicherActionDetails keeps activity-log history over synthetic rows', () => {
    const rich = [
      {
        action: 'TABLE_CALL_CONFIRMED',
        status: 'confirmed',
        waiterName: 'Alice',
        time: '2026-01-01T10:00:00Z',
      },
      {
        action: 'TABLE_CALL_PREPARED',
        status: 'prepared',
        waiterName: 'Bob',
        time: '2026-01-01T10:05:00Z',
      },
    ];
    const synthetic = [{ status: 'prepared', time: '2026-01-01T10:05:00Z' }];
    expect(pickRicherActionDetails(synthetic, rich)).toEqual(rich);
    expect(pickRicherActionDetails(rich, synthetic)).toEqual(rich);
  });

  it('resolveWorkflowStageActors returns independent actor per stage', () => {
    const actors = resolveWorkflowStageActors([
      {
        action: 'TABLE_CALL_CONFIRMED',
        status: 'confirmed',
        waiterName: 'Alice',
      },
      {
        action: 'TABLE_CALL_ITEMS_UPDATED',
        status: 'confirmed',
        waiterName: 'Editor',
      },
      {
        action: 'TABLE_CALL_PREPARED',
        status: 'prepared',
        waiterName: 'Bob',
      },
      {
        action: 'TABLE_CALL_DELIVERED',
        status: 'delivered',
        waiterName: 'Charlie',
      },
    ]);

    expect(actors).toEqual({
      confirmed: 'Alice',
      prepared: 'Bob',
      delivered: 'Charlie',
    });
  });

  it('staffParticipatedInActionDetails ignores item editors', () => {
    expect(
      staffParticipatedInActionDetails(
        [
          {
            action: 'TABLE_CALL_CONFIRMED',
            status: 'confirmed',
            waiterName: 'Alice',
          },
          {
            action: 'TABLE_CALL_ITEMS_UPDATED',
            status: 'confirmed',
            waiterName: 'Bob',
          },
        ],
        'Alice',
      ),
    ).toBe(true);

    expect(
      staffParticipatedInActionDetails(
        [
          {
            action: 'TABLE_CALL_ITEMS_UPDATED',
            status: 'confirmed',
            waiterName: 'Bob',
          },
        ],
        'Alice',
      ),
    ).toBe(false);
  });

  it('buildActionDetailsFromActions maps action field for list/detail parity', () => {
    expect(
      buildActionDetailsFromActions([
        {
          action: 'TABLE_CALL_CONFIRMED',
          status: 'confirmed',
          waiterName: 'Alice',
          time: '2026-01-01T10:00:00Z',
        },
      ]),
    ).toEqual([
      {
        action: 'TABLE_CALL_CONFIRMED',
        status: 'confirmed',
        waiterName: 'Alice',
        time: '2026-01-01T10:00:00Z',
      },
    ]);
  });
});
