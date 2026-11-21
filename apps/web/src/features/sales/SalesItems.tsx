import type { Named } from "@/lib/api";
import type { SalesItemInput } from "./types";
import s from "./Sales.module.css";

export const emptySalesItem = (): SalesItemInput => ({
  productId: "",
  quantity: 1,
  unitPrice: "",
  offerType: "NONE",
  bonusQuantity: 0,
  discountPercent: "0",
});
export function SalesItems({
  items,
  products,
  onChange,
}: {
  items: SalesItemInput[];
  products: Named[];
  onChange: (items: SalesItemInput[]) => void;
}) {
  function update(index: number, patch: Partial<SalesItemInput>) {
    onChange(
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }
  return (
    <section className={s.list} aria-label="أصناف الطلب">
      <h3>الأصناف — الأسعار بالليرة السورية</h3>
      {items.map((item, index) => (
        <div className={s.line} key={index}>
          <div className={s.lineHeading}>
            <span>الصنف {index + 1}</span>
          </div>
          <div className={s.grid}>
            <label>
              الصنف
              <select
                required
                value={item.productId}
                onChange={(e) => update(index, { productId: e.target.value })}
              >
                <option value="">اختر الصنف</option>
                {products.map((p) => (
                  <option
                    value={p.id}
                    key={p.id}
                    disabled={items.some(
                      (v, i) => i !== index && v.productId === p.id,
                    )}
                  >
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              الكمية المباعة
              <input
                type="number"
                min={1}
                max={1000000}
                step={1}
                required
                value={item.quantity}
                onChange={(e) =>
                  update(index, { quantity: Number(e.target.value) })
                }
              />
            </label>
            <label>
              سعر الوحدة — ل.س
              <input
                type="number"
                min="0.01"
                max="9999999999.99"
                step="0.01"
                required
                value={item.unitPrice}
                onChange={(e) => update(index, { unitPrice: e.target.value })}
              />
            </label>
            <label>
              العرض
              <select
                value={item.offerType}
                onChange={(e) =>
                  update(index, {
                    offerType: e.target.value as SalesItemInput["offerType"],
                    bonusQuantity: 0,
                    discountPercent: "0",
                  })
                }
              >
                <option value="NONE">بدون عرض</option>
                <option value="BONUS">بونص — قطع مجانية</option>
                <option value="DISCOUNT">حسم — نسبة مئوية</option>
              </select>
            </label>
            {item.offerType === "BONUS" && (
              <label>
                عدد القطع المجانية
                <input
                  type="number"
                  min={1}
                  max={1000000}
                  step={1}
                  required
                  value={item.bonusQuantity}
                  onChange={(e) =>
                    update(index, { bonusQuantity: Number(e.target.value) })
                  }
                />
              </label>
            )}
            {item.offerType === "DISCOUNT" && (
              <label>
                الحسم %
                <input
                  type="number"
                  min="0.01"
                  max={100}
                  step="0.01"
                  required
                  value={item.discountPercent}
                  onChange={(e) =>
                    update(index, { discountPercent: e.target.value })
                  }
                />
              </label>
            )}
          </div>
          {items.length > 1 && (
            <button
              className={s.button}
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              إزالة الصنف
            </button>
          )}
        </div>
      ))}
      <button
        className={s.button}
        type="button"
        disabled={items.length >= 100 || items.length >= products.length}
        onClick={() => onChange([...items, emptySalesItem()])}
      >
        + إضافة صنف
      </button>
    </section>
  );
}
