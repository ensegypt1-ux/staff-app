import { DynamicModule } from '@nestjs/common';
export type FcmModuleOptions = {
    enableApi: boolean;
    enableWorker: boolean;
};
export declare class FcmModule {
    static forRoot(options: FcmModuleOptions): DynamicModule;
}
