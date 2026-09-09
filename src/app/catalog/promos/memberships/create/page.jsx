'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const DISCOUNT_TYPES = ['Percentage', 'Fixed Amount'];
const COLOR_PRESETS = ['#B00000', '#539D62', '#dc2626', '#B00000', '#ea580c', '#B00000', '#4b5563'];

const initialForm = {
  appearance_type: 'image',
  image_url: '',
  color: '#B00000',
  name: '',
  membership_code: '',
  category_id: '',
  sub_category_id: '',
  description: '',
  show_in_catalog: true,
  price: '',
  is_tax_inclusive: false,
  tax_id: '',
  charge_id: '',
  hsn_code: '',
  discount_type: 'Percentage',
  discount_value: '',
  quantity: '1',
  validity_days: '',
  auto_renew: false,
  update_existing: false,
  min_amount_required: '',
  customer_group_id: '',
  store_wise_pricing: false,
};

function Section({ title, subtitle, children }) {
  return (
    <section className="mb-5 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 bg-slate-50 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-gray-500">{subtitle}</p> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Field({ label, required, children, className = '' }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-medium text-gray-600">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      {children}
    </div>
  );
}

function RadioYesNo({ value, onChange, name }) {
  return (
    <div className="flex items-center gap-5">
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="radio"
          name={name}
          checked={value === true}
          onChange={() => onChange(true)}
          className="h-4 w-4 border-gray-300 text-blue-600"
        />
        Yes
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="radio"
          name={name}
          checked={value === false}
          onChange={() => onChange(false)}
          className="h-4 w-4 border-gray-300 text-blue-600"
        />
        No
      </label>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

export default function CreateMembershipPage() {
  const router = useRouter();
  const fileRef = useRef(null);
  const [form, setForm] = useState(initialForm);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [charges, setCharges] = useState([]);
  const [customerGroups, setCustomerGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    (async () => {
      try {
        const [catRes, subRes, taxRes, chargeRes, groupRes] = await Promise.all([
          fetch('/api/catalog/categories?pageSize=500'),
          fetch('/api/catalog/sub-categories?pageSize=500'),
          fetch('/api/catalog/taxes?pageSize=200'),
          fetch('/api/catalog/charges?pageSize=200'),
          fetch('/api/customer-groups'),
        ]);
        const [catJson, subJson, taxJson, chargeJson, groups] = await Promise.all([
          catRes.json(),
          subRes.json(),
          taxRes.json(),
          chargeRes.json(),
          groupRes.json(),
        ]);
        if (catJson.success) setCategories(catJson.data?.records || []);
        if (subJson.success) setSubCategories(subJson.data?.records || []);
        if (taxJson.success) setTaxes(taxJson.data?.records || []);
        if (chargeJson.success) setCharges(chargeJson.data?.records || []);
        if (Array.isArray(groups)) setCustomerGroups(groups);
      } catch (err) {
        console.error('membership lookups failed', err);
      }
    })();
  }, []);

  const filteredSubCategories = useMemo(() => {
    if (!form.category_id) return subCategories;
    return subCategories.filter((sc) => String(sc.category_id) === String(form.category_id));
  }, [subCategories, form.category_id]);

  const handleImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set('image_url', String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const onSave = async () => {
    setError('');
    if (!form.name.trim()) {
      setError('Membership name is required');
      return;
    }
    if (!form.category_id) {
      setError('Category is required');
      return;
    }
    if (form.price === '') {
      setError('Price is required');
      return;
    }
    if (!form.tax_id) {
      setError('Tax is required');
      return;
    }
    if (form.discount_value === '') {
      setError('Discount is required');
      return;
    }
    if (!form.validity_days) {
      setError('Validity (days) is required');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...form,
        price: Number(form.price),
        discount_value: Number(form.discount_value),
        quantity: form.quantity === '' ? 1 : Number(form.quantity),
        validity_days: Number(form.validity_days),
        min_amount_required: form.min_amount_required === '' ? 0 : Number(form.min_amount_required),
        category_id: Number(form.category_id),
        sub_category_id: form.sub_category_id ? Number(form.sub_category_id) : null,
        tax_id: Number(form.tax_id),
        charge_id: form.charge_id ? Number(form.charge_id) : null,
        customer_group_id: form.customer_group_id ? Number(form.customer_group_id) : null,
        max_customer_type:
          customerGroups.find((g) => String(g.id) === String(form.customer_group_id))?.name || null,
      };

      const res = await fetch('/api/catalog/memberships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) {
        const msg =
          json.errors?.name ||
          json.errors?.category_id ||
          json.errors?.price ||
          json.errors?.tax_id ||
          json.errors?.discount_value ||
          json.errors?.validity_days ||
          json.message ||
          'Failed to save membership';
        throw new Error(msg);
      }
      router.push('/catalog/promos/memberships');
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8fc] p-6 text-sm text-gray-900">
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-gray-500">
        <Link href="/catalog" className="text-blue-600 hover:underline">
          Catalog
        </Link>
        <span>›</span>
        <Link href="/catalog/promos/memberships" className="text-blue-600 hover:underline">
          Memberships
        </Link>
        <span>›</span>
        <span className="font-medium text-gray-700">Create Membership</span>
      </nav>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-gray-900">Create Membership</h1>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/catalog/promos/memberships"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={onSave}
            disabled={loading}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <Section
        title="Membership Appearance"
        subtitle="Upload a membership image and choose a color to uniquely identify the membership."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-800">
              <input
                type="radio"
                name="appearance_type"
                checked={form.appearance_type === 'image'}
                onChange={() => set('appearance_type', 'image')}
                className="h-4 w-4 text-blue-600"
              />
              Upload Picture
            </label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-[120px] w-[120px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 text-gray-500 hover:border-blue-400"
            >
              {form.appearance_type === 'image' && form.image_url ? (
                <img src={form.image_url} alt="" className="h-full w-full rounded-lg object-cover" />
              ) : (
                <>
                  <span className="text-2xl text-blue-500">+</span>
                  <span className="mt-1 text-xs">Upload Image</span>
                </>
              )}
            </button>
          </div>

          <div>
            <label className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-800">
              <input
                type="radio"
                name="appearance_type"
                checked={form.appearance_type === 'color'}
                onChange={() => set('appearance_type', 'color')}
                className="h-4 w-4 text-blue-600"
              />
              Choose Color
            </label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    set('appearance_type', 'color');
                    set('color', c);
                  }}
                  className={`h-9 w-9 rounded-full border-2 ${form.color === c ? 'border-gray-900' : 'border-white shadow'}`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
            <input
              type="color"
              value={form.color}
              onChange={(e) => {
                set('appearance_type', 'color');
                set('color', e.target.value);
              }}
              className="mt-3 h-10 w-16 cursor-pointer rounded border border-gray-300"
            />
          </div>
        </div>
      </Section>

      <Section title="Basic Information">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Membership Name" required>
            <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Membership Code">
            <input
              className={inputCls}
              value={form.membership_code}
              onChange={(e) => set('membership_code', e.target.value)}
            />
          </Field>
          <Field label="Category" required>
            <select
              className={inputCls}
              value={form.category_id}
              onChange={(e) => {
                set('category_id', e.target.value);
                set('sub_category_id', '');
              }}
            >
              <option value="">Select Category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sub-Category">
            <select
              className={inputCls}
              value={form.sub_category_id}
              onChange={(e) => set('sub_category_id', e.target.value)}
            >
              <option value="">Select Sub-Category</option>
              {filteredSubCategories.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Description" className="md:col-span-2">
            <textarea
              className={`${inputCls} min-h-[88px]`}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>
          <Field label="Show in Catalog">
            <RadioYesNo
              name="show_in_catalog"
              value={form.show_in_catalog}
              onChange={(v) => set('show_in_catalog', v)}
            />
          </Field>
        </div>
      </Section>

      <Section title="Pricing Information">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Price" required>
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputCls}
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
            />
          </Field>
          <Field label="Is Tax Inclusive?">
            <RadioYesNo
              name="is_tax_inclusive"
              value={form.is_tax_inclusive}
              onChange={(v) => set('is_tax_inclusive', v)}
            />
          </Field>
          <Field label="Tax" required>
            <select className={inputCls} value={form.tax_id} onChange={(e) => set('tax_id', e.target.value)}>
              <option value="">Select Tax</option>
              {taxes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.rate != null ? ` (${t.rate}%)` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Charge">
            <select className={inputCls} value={form.charge_id} onChange={(e) => set('charge_id', e.target.value)}>
              <option value="">Select Charge</option>
              {charges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="HSN Code">
            <input className={inputCls} value={form.hsn_code} onChange={(e) => set('hsn_code', e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Membership Configuration">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Discount Type">
            <select
              className={inputCls}
              value={form.discount_type}
              onChange={(e) => set('discount_type', e.target.value)}
            >
              <option value="">Select Discount Type</option>
              {DISCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Discount" required>
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputCls}
              value={form.discount_value}
              onChange={(e) => set('discount_value', e.target.value)}
            />
          </Field>
          <Field label="Quantity">
            <input
              type="number"
              min="1"
              className={inputCls}
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value)}
            />
          </Field>
          <Field label="Auto Renew Membership?">
            <RadioYesNo name="auto_renew" value={form.auto_renew} onChange={(v) => set('auto_renew', v)} />
          </Field>
          <Field label="Validity (days)" required>
            <input
              type="number"
              min="1"
              className={inputCls}
              value={form.validity_days}
              onChange={(e) => set('validity_days', e.target.value)}
            />
          </Field>
          <Field label="Update existing membership">
            <RadioYesNo
              name="update_existing"
              value={form.update_existing}
              onChange={(v) => set('update_existing', v)}
            />
          </Field>
          <Field label="Min. Amount Required">
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputCls}
              value={form.min_amount_required}
              onChange={(e) => set('min_amount_required', e.target.value)}
            />
          </Field>
          <Field label="Max. Customer Type">
            <select
              className={inputCls}
              value={form.customer_group_id}
              onChange={(e) => set('customer_group_id', e.target.value)}
            >
              <option value="">Select Customer Type</option>
              {customerGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name || g.group_name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Store Wise Pricing">
        <button
          type="button"
          onClick={() => set('store_wise_pricing', !form.store_wise_pricing)}
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          Manage Store Wise Pricing
        </button>
        {form.store_wise_pricing ? (
          <p className="mt-2 text-xs text-gray-500">
            Store-wise pricing is enabled. Per-store prices can be configured when that module is available.
          </p>
        ) : null}
      </Section>
    </div>
  );
}
