export declare class RegisterFcmDeviceDto {
    token: string;
    platform: string;
    deviceId?: string;
    appVersion?: string;
    locale?: string;
}
export declare class RefreshFcmDeviceDto {
    oldToken: string;
    newToken: string;
    platform: string;
    deviceId?: string;
}
export declare class UnregisterFcmDeviceDto {
    token?: string;
    deviceId?: string;
}
