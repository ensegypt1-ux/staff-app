-- CreateTable
CREATE TABLE "staff_fcm_devices" (
    "id" TEXT NOT NULL,
    "staffId" INTEGER NOT NULL,
    "menuId" INTEGER NOT NULL,
    "staffRoleId" INTEGER,
    "fcmToken" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceId" TEXT,
    "permissionsJson" TEXT NOT NULL,
    "appVersion" TEXT,
    "locale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_fcm_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fcm_delivery_logs" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "menuId" INTEGER NOT NULL,
    "staffCallId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fcm_delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_fcm_devices_fcmToken_key" ON "staff_fcm_devices"("fcmToken");

-- CreateIndex
CREATE INDEX "staff_fcm_devices_menuId_staffId_idx" ON "staff_fcm_devices"("menuId", "staffId");

-- CreateIndex
CREATE INDEX "staff_fcm_devices_staffId_idx" ON "staff_fcm_devices"("staffId");

-- CreateIndex
CREATE INDEX "staff_fcm_devices_menuId_idx" ON "staff_fcm_devices"("menuId");

-- CreateIndex
CREATE UNIQUE INDEX "fcm_delivery_logs_eventId_key" ON "fcm_delivery_logs"("eventId");

-- CreateIndex
CREATE INDEX "fcm_delivery_logs_menuId_createdAt_idx" ON "fcm_delivery_logs"("menuId", "createdAt");
