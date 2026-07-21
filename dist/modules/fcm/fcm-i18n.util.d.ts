import { FcmOrderChannel, FcmPushKind } from './fcm.constants';
export declare function localizeFcmNotification(input: {
    locale?: string | null;
    kind: FcmPushKind;
    channel: FcmOrderChannel;
    tableNumber: string;
    customerName?: string;
}): {
    title: string;
    body: string;
};
