import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/** Staff login body forwarded to Express `staff-auth/login`. */
export class StaffLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

/** Logout body is optional / opaque upstream payload. */
export class StaffLogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
