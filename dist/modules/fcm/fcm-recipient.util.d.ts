import { FcmOrderChannel, FcmPushKind } from './fcm.constants';
export declare function parsePermissionsJson(raw: string | null | undefined): string[];
export declare function deviceShouldReceivePush(input: {
    permissions: string[];
    kind: FcmPushKind;
    channel: FcmOrderChannel;
}): boolean;
