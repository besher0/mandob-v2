import type { RepEditorFormProps } from "./rep-editor.types";
import { useRepEditorForm } from "./useRepEditorForm";
import s from "./ManagerApp.module.css";
const toggle = (ids: string[], id: string) =>
  ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];

export function RepEditorForm({data, token, onClose, onSaved}: RepEditorFormProps) {
  const { name, setName, username, setUsername, password, setPassword, teamId, areaIds, setAreas, productIds, setProducts, specialtyIds, setSpecialties, custom, setCustom, daily, setDaily, busy, error, team, availableTeams, selectTeam, submit } = useRepEditorForm({data, token, onSaved});
  return (
    <form onSubmit={submit}>
      <div className={s.repFormGrid}>
        <label className={s.editorField}>
          اسم المندوب
          <input
            required
            maxLength={120}
            value={name}
            disabled={data.rep?.shared}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className={s.editorField}>
          اسم المستخدم
          <input
            required
            readOnly={!!data.rep}
            value={username}
            pattern="[a-zA-Z0-9_.-]{3,80}"
            dir="ltr"
            autoComplete="off"
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        {!data.rep && (
          <label className={s.editorField}>
            كلمة المرور
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <small>8 أحرف على الأقل.</small>
          </label>
        )}
        <label className={s.editorField}>
          الفريق
          <select
            required
            value={teamId}
            onChange={(e) => selectTeam(e.target.value)}
          >
            <option value="">اختر الفريق</option>
            {availableTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className={s.editorField}>
          اختصاصات المندوب
          <select
            value={custom ? "custom" : "team"}
            onChange={(e) => setCustom(e.target.value === "custom")}
          >
            <option value="team">استخدام اختصاصات الفريق</option>
            <option value="custom">اختصاصات مخصصة للمندوب</option>
          </select>
        </label>
        <label className={s.editorField}>
          الهدف اليومي للزيارات
          <input
            type="number"
            required
            min={1}
            max={500}
            value={daily}
            disabled={data.rep?.shared}
            onChange={(e) => setDaily(e.target.value)}
          />
        </label>
      </div>
      {data.rep?.shared && (
        <p className={s.notice}>
          المندوب مشترك مع مدير آخر. تعديل الاسم والهدف اليومي من إدارة الشركة؛
          تعديلك هنا يخص الفريق المحدد فقط.
        </p>
      )}
      {team && (
        <>
          {custom && (
            <fieldset className={s.editorOptions}>
              <legend>الاختصاصات المخصصة</legend>
              {team.specialties.map((x) => (
                <label key={x.id}>
                  <input
                    type="checkbox"
                    checked={specialtyIds.includes(x.id)}
                    onChange={() => setSpecialties(toggle(specialtyIds, x.id))}
                  />
                  {x.name}
                </label>
              ))}
            </fieldset>
          )}
          {!team.specialties.length && (
            <p className={s.notice}>
              حدد اختصاصات الفريق من «تعديل الفريق» أولاً.
            </p>
          )}
          <fieldset className={s.editorOptions}>
            <legend>الأصناف الخاصة بالمندوب</legend>
            {team.products.map((x) => (
              <label key={x.id}>
                <input
                  type="checkbox"
                  checked={productIds.includes(x.id)}
                  onChange={() => setProducts(toggle(productIds, x.id))}
                />
                {x.name}
              </label>
            ))}
          </fieldset>
          {!team.products.length && (
            <p className={s.notice}>
              حدد أصناف الفريق من «تعديل الفريق» أولاً.
            </p>
          )}
          <fieldset className={s.editorOptions}>
            <legend>المناطق</legend>
            {data.areas
              .filter((a) => a.provinceId === team.provinceId)
              .map((x) => (
                <label key={x.id}>
                  <input
                    type="checkbox"
                    checked={areaIds.includes(x.id)}
                    onChange={() => setAreas(toggle(areaIds, x.id))}
                  />
                  {x.name}
                </label>
              ))}
          </fieldset>
        </>
      )}
      {data.rep && (
        <p className={s.muted}>
          إذا كان التكليف مستخدماً في زيارات، يسري تغييره من اليوم التالي حفاظاً
          على سجله.
        </p>
      )}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      <div className={s.dialogFooter}>
      <button
        className={s.btn}
        disabled={
          busy || !team || !team.specialties.length || !team.products.length
        }
      >
        {busy ? "جارِ الحفظ…" : "حفظ المندوب"}
      </button>
      <button type="button" className={`${s.btn} ${s.secondary}`} disabled={busy} onClick={onClose}>إلغاء</button>
      </div>
    </form>
  );
}
