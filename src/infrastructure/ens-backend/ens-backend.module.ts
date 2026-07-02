import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { EnsHttpService } from './ens-http.service';
import { UpstreamClockService } from './upstream-clock.service';
import { AssetUrlService } from '../storage/asset-url.service';

@Global()
@Module({
  imports: [HttpModule.register({ maxRedirects: 0 })],
  providers: [
    UpstreamClockService,
    EnsHttpService,
    ApiKeyService,
    AssetUrlService,
  ],
  exports: [EnsHttpService, ApiKeyService, AssetUrlService, UpstreamClockService],
})
export class EnsBackendModule {}
