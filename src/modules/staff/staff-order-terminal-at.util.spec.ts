import {
  isArchivedVisible,
  isOperationallyVisible,
  resolveTerminalAtMs,
  STAFF_ARCHIVE_GRACE_MS,
} from './staff-order-terminal-at.util';
import { StaffOrderActionDetail } from './staff-order-action-details.util';

const HOUR = 60 * 60 * 1000;

describe('staff-order-terminal-at.util', () => {
  const now = Date.parse('2026-07-22T12:00:00.000Z');

  function detail(
    partial: Partial<StaffOrderActionDetail>,
  ): StaffOrderActionDetail {
    return { ...partial };
  }

  describe('resolveTerminalAtMs', () => {
    it('prefers latest delivered/cancelled action time', () => {
      const ms = resolveTerminalAtMs(
        {
          status: 'delivered',
          createdAt: '2026-07-20T00:00:00.000Z',
          lastEditedAt: '2026-07-21T00:00:00.000Z',
          actionDetails: [
            detail({
              action: 'TABLE_CALL_CONFIRMED',
              time: '2026-07-20T01:00:00.000Z',
            }),
            detail({
              action: 'TABLE_CALL_DELIVERED',
              time: '2026-07-22T10:00:00.000Z',
            }),
          ],
        },
        now,
      );
      expect(ms).toBe(Date.parse('2026-07-22T10:00:00.000Z'));
    });

    it('falls back to lastEditedAt then createdAt', () => {
      expect(
        resolveTerminalAtMs(
          {
            status: 'cancelled',
            createdAt: '2026-07-20T00:00:00.000Z',
            lastEditedAt: '2026-07-21T08:00:00.000Z',
            actionDetails: [],
          },
          now,
        ),
      ).toBe(Date.parse('2026-07-21T08:00:00.000Z'));

      expect(
        resolveTerminalAtMs(
          {
            status: 'cancelled',
            createdAt: '2026-07-20T00:00:00.000Z',
            actionDetails: [],
          },
          now,
        ),
      ).toBe(Date.parse('2026-07-20T00:00:00.000Z'));
    });

    it('returns null when nothing parseable', () => {
      expect(
        resolveTerminalAtMs(
          { status: 'delivered', actionDetails: [], createdAt: null },
          now,
        ),
      ).toBeNull();
    });
  });

  describe('membership', () => {
    it('keeps active statuses operational always', () => {
      expect(
        isOperationallyVisible(
          { status: 'pending', createdAt: '2020-01-01T00:00:00.000Z' },
          now,
        ),
      ).toBe(true);
      expect(
        isArchivedVisible(
          { status: 'prepared', createdAt: '2020-01-01T00:00:00.000Z' },
          now,
        ),
      ).toBe(false);
    });

    it('keeps terminal under 24h on operational', () => {
      const terminalAt = new Date(now - (STAFF_ARCHIVE_GRACE_MS - HOUR)).toISOString();
      expect(
        isOperationallyVisible(
          {
            status: 'delivered',
            actionDetails: [
              detail({ action: 'TABLE_CALL_DELIVERED', time: terminalAt }),
            ],
          },
          now,
        ),
      ).toBe(true);
      expect(
        isArchivedVisible(
          {
            status: 'delivered',
            actionDetails: [
              detail({ action: 'TABLE_CALL_DELIVERED', time: terminalAt }),
            ],
          },
          now,
        ),
      ).toBe(false);
    });

    it('archives terminal at or beyond 24h', () => {
      const terminalAt = new Date(now - STAFF_ARCHIVE_GRACE_MS).toISOString();
      expect(
        isOperationallyVisible(
          {
            status: 'cancelled',
            actionDetails: [
              detail({ action: 'TABLE_CALL_CANCELLED', time: terminalAt }),
            ],
          },
          now,
        ),
      ).toBe(false);
      expect(
        isArchivedVisible(
          {
            status: 'cancelled',
            actionDetails: [
              detail({ action: 'TABLE_CALL_CANCELLED', time: terminalAt }),
            ],
          },
          now,
        ),
      ).toBe(true);
    });

    it('archives terminal with missing timestamps', () => {
      expect(
        isOperationallyVisible(
          { status: 'delivered', createdAt: null, actionDetails: [] },
          now,
        ),
      ).toBe(false);
      expect(
        isArchivedVisible(
          { status: 'delivered', createdAt: null, actionDetails: [] },
          now,
        ),
      ).toBe(true);
    });
  });
});
