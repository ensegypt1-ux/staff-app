import { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
export declare class UpstreamExceptionFilter implements ExceptionFilter {
    private readonly logger;
    catch(exception: unknown, host: ArgumentsHost): void;
    private normalize;
}
