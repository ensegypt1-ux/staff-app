import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller';
import { StaffCoreModule } from './staff-core.module';

@Module({
  imports: [StaffCoreModule],
  controllers: [StaffController],
})
export class StaffModule {}
