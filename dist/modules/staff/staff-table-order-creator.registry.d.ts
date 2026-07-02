import { OnModuleInit } from '@nestjs/common';
export declare class StaffTableOrderCreatorRegistry implements OnModuleInit {
    private readonly logger;
    private readonly records;
    private readonly dataPath;
    onModuleInit(): void;
    record(menuId: number, staffCallId: number, staffId: number): void;
    lookup(menuId: number, staffCallId: number): number | null;
    private key;
    private loadFromDisk;
    private persistToDisk;
}
