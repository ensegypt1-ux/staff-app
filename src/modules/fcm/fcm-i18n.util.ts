import { FcmOrderChannel, FcmPushKind } from './fcm.constants';

const EN: Record<FcmPushKind, { title: string; body: (ctx: LocaleCtx) => string }> =
  {
    new_call: {
      title: 'New order',
      body: (ctx) =>
        ctx.channel === 'delivery'
          ? ctx.customerName || 'New online order'
          : `Table ${ctx.tableNumber || '—'}`,
    },
    guest_add: {
      title: 'Guest addition',
      body: (ctx) => `Table ${ctx.tableNumber || '—'}`,
    },
    bill: {
      title: 'Bill request',
      body: (ctx) => `Table ${ctx.tableNumber || '—'}`,
    },
    waiter_request: {
      title: 'Waiter request',
      body: (ctx) => `Table ${ctx.tableNumber || '—'}`,
    },
  };

const AR: Record<FcmPushKind, { title: string; body: (ctx: LocaleCtx) => string }> =
  {
    new_call: {
      title: 'طلب جديد',
      body: (ctx) =>
        ctx.channel === 'delivery'
          ? ctx.customerName || 'طلب أونلاين جديد'
          : `طاولة ${ctx.tableNumber || '—'}`,
    },
    guest_add: {
      title: 'إضافة ضيف',
      body: (ctx) => `طاولة ${ctx.tableNumber || '—'}`,
    },
    bill: {
      title: 'طلب فاتورة',
      body: (ctx) => `طاولة ${ctx.tableNumber || '—'}`,
    },
    waiter_request: {
      title: 'طلب نادل',
      body: (ctx) => `طاولة ${ctx.tableNumber || '—'}`,
    },
  };

type LocaleCtx = {
  channel: FcmOrderChannel;
  tableNumber: string;
  customerName?: string;
};

export function localizeFcmNotification(input: {
  locale?: string | null;
  kind: FcmPushKind;
  channel: FcmOrderChannel;
  tableNumber: string;
  customerName?: string;
}): { title: string; body: string } {
  const isAr = String(input.locale ?? '')
    .trim()
    .toLowerCase()
    .startsWith('ar');
  const pack = isAr ? AR : EN;
  const entry = pack[input.kind];
  const ctx: LocaleCtx = {
    channel: input.channel,
    tableNumber: input.tableNumber,
    customerName: input.customerName,
  };
  return { title: entry.title, body: entry.body(ctx) };
}
