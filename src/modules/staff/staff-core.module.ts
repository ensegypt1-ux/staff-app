import { Module } from '@nestjs/common';
import { StaffOrderPresenterService } from './staff-order-presenter.service';
import { StaffOrdersFlowService } from './staff-orders-flow.service';

/** Shared staff order services without HTTP controllers (safe for Worker). */
@Module({
  providers: [StaffOrderPresenterService, StaffOrdersFlowService],
  exports: [StaffOrdersFlowService, StaffOrderPresenterService],
})
export class StaffCoreModule {}
