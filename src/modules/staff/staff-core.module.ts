import { Module } from '@nestjs/common';
import { StaffOrderPresenterService } from './staff-order-presenter.service';
import { StaffOrdersFlowService } from './staff-orders-flow.service';
import { StaffTableOrderCreatorRegistry } from './staff-table-order-creator.registry';

/** Shared staff order services without HTTP controllers (safe for Worker). */
@Module({
  providers: [
    StaffOrderPresenterService,
    StaffOrdersFlowService,
    StaffTableOrderCreatorRegistry,
  ],
  exports: [StaffOrdersFlowService, StaffOrderPresenterService],
})
export class StaffCoreModule {}
