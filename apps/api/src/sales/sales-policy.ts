import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { SalesItemDto } from './sales.dto.js';

export function salesDate(value: string) {
  const date = new Date(value + 'T00:00:00Z');
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    value >
      new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Damascus' })
  ) {
    throw new BadRequestException('تاريخ التسجيل غير صالح أو في المستقبل.');
  }
  return date;
}
export function priceItems(items: SalesItemDto[]) {
  if (new Set(items.map((item) => item.productId)).size !== items.length)
    throw new BadRequestException('الصنف مكرر في الطلب.');
  return items.map((item) => {
    const unitPrice = new Prisma.Decimal(item.unitPrice);
    const discountPercent = new Prisma.Decimal(item.discountPercent);
    if (unitPrice.lte(0) || discountPercent.gt(100) || discountPercent.lt(0))
      throw new BadRequestException('السعر أو الحسم غير صالح.');
    if (
      (item.offerType !== 'BONUS' && item.bonusQuantity !== 0) ||
      (item.offerType !== 'DISCOUNT' && !discountPercent.isZero()) ||
      (item.offerType === 'BONUS' && item.bonusQuantity === 0) ||
      (item.offerType === 'DISCOUNT' && discountPercent.isZero())
    )
      throw new BadRequestException('تفاصيل العرض لا تطابق نوعه.');
    const total = unitPrice
      .mul(item.quantity)
      .mul(new Prisma.Decimal(100).sub(discountPercent))
      .div(100)
      .toDecimalPlaces(2);
    return {
      productId: item.productId,
      quantity: item.quantity,
      offerType: item.offerType,
      bonusQuantity: item.bonusQuantity,
      unitPrice,
      discountPercent,
      total,
    };
  });
}
