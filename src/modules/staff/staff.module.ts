import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller';
import { StaffOrderPresenterService } from './staff-order-presenter.service';
import { StaffOrdersFlowService } from './staff-orders-flow.service';
import { StaffTableOrderCreatorRegistry } from './staff-table-order-creator.registry';

@Module({
  controllers: [StaffController],
  providers: [
    StaffOrderPresenterService,
    StaffOrdersFlowService,
    StaffTableOrderCreatorRegistry,
  ],
})
export class StaffModule {}
