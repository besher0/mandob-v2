-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SalesOfferType" AS ENUM ('NONE', 'BONUS', 'DISCOUNT');

-- CreateTable
CREATE TABLE "SalesAgent" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "provinceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SalesAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesVisit" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "provinceId" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "clientRef" UUID NOT NULL,
    "visitedOn" DATE NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "provinceId" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "visitId" UUID,
    "clientRef" UUID NOT NULL,
    "orderedOn" DATE NOT NULL,
    "notes" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'PENDING',
    "total" DECIMAL(20,2) NOT NULL,
    "reviewerId" UUID,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(16,2) NOT NULL,
    "offerType" "SalesOfferType" NOT NULL,
    "bonusQuantity" INTEGER NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL(5,2) NOT NULL,
    "total" DECIMAL(20,2) NOT NULL,

    CONSTRAINT "SalesOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesAgent_organizationId_provinceId_name_key" ON "SalesAgent"("organizationId", "provinceId", "name");

-- CreateIndex
CREATE INDEX "SalesVisit_organizationId_visitedOn_idx" ON "SalesVisit"("organizationId", "visitedOn");

-- CreateIndex
CREATE UNIQUE INDEX "SalesVisit_authorId_clientRef_key" ON "SalesVisit"("authorId", "clientRef");

-- CreateIndex
CREATE INDEX "SalesOrder_organizationId_status_orderedOn_idx" ON "SalesOrder"("organizationId", "status", "orderedOn");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_authorId_clientRef_key" ON "SalesOrder"("authorId", "clientRef");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrderItem_orderId_productId_key" ON "SalesOrderItem"("orderId", "productId");

-- AddForeignKey
ALTER TABLE "SalesAgent" ADD CONSTRAINT "SalesAgent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesAgent" ADD CONSTRAINT "SalesAgent_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVisit" ADD CONSTRAINT "SalesVisit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVisit" ADD CONSTRAINT "SalesVisit_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVisit" ADD CONSTRAINT "SalesVisit_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVisit" ADD CONSTRAINT "SalesVisit_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "FieldTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "FieldTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "SalesAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "SalesVisit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


INSERT INTO "Role" ("id","code","name","isSystem","createdAt","updatedAt") VALUES (gen_random_uuid(),'SALES_MANAGER','مدير المبيعات',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("code") DO NOTHING;
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "sales_item_values" CHECK ("quantity" > 0 AND "unitPrice" > 0 AND "bonusQuantity" >= 0 AND "discountPercent" BETWEEN 0 AND 100 AND "total" >= 0);
ALTER TABLE "SalesOrder" ADD CONSTRAINT "sales_order_total" CHECK ("total" >= 0 AND "currency" = 'SYP');
