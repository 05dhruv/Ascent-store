'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchAllCatalogProducts } from '@/lib/productPagination';

const COMBO_TYPES = ['Fixed', 'Flexible', 'Meal', 'Bundle'];
const FOOD_TYPES = ['Veg', 'Non-Veg', 'Egg', 'Vegan', 'Not Applicable'];

const initialForm = {
  name: '',
  combo_code: '',
  description: '',
  combo_type: '',
  category_id: '',
  sub_category_id: '',
  food_type: '',
  image_url: '',
  price: '',
  tax_inclusive: false,
  discount: '',
  tax_id: '',
  hsn: '',
  effective_date: '',
  store_wise_pricing: false,
  sku: '',
  barcode: '',
  sort_sequence: '0',
};

function Section({ title, children, action }) {
  return (
    <section className="mb-5 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 bg-slate-50 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {action}
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

const inputCls =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

export default function CreateComboPage() {
  const router = useRouter();
  const fileRef = useRef(null);
  const [form, setForm] = useState(initialForm);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [comboLines, setComboLines] = useState([]);
  const [productPick, setProductPick] = useState('');
  const [productQty, setProductQty] = useState('1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    (async () => {
      try {
        const [catRes, subRes, taxRes, products] = await Promise.all([
          fetch('/api/catalog/categories?pageSize=500'),
          fetch('/api/catalog/sub-categories?pageSize=500'),
          fetch('/api/catalog/taxes?pageSize=200'),
          fetchAllCatalogProducts({ pageSize: 500 }),
        ]);
        const [catJson, subJson, taxJson] = await Promise.all([
          catRes.json(),
          subRes.json(),
          taxRes.json(),
        ]);
        if (catJson.success) setCategories(catJson.data?.records || []);
        if (subJson.success) setSubCategories(subJson.data?.records || []);
        if (taxJson.success) setTaxes(taxJson.data?.records || []);
        setAllProducts(products);
      } catch (err) {
        console.error('combo lookups failed', err);
      }
    })();
  }, []);

  const filteredSubCategories = useMemo(() => {
    if (!form.category_id) return subCategories;
    return subCategories.filter((sc) => String(sc.category_id) === String(form.category_id));
  }, [subCategories, form.category_id]);

  const availableProducts = useMemo(
    () => allProducts.filter((p) => !comboLines.some((l) => l.product_id === p.id)),
    [allProducts, comboLines]
  );

  const handleImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set('image_url', String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const addProductLine = () => {
    const pid = Number(productPick);
    if (!pid) {
      setError('Select a product to add');
      return;
    }
    const prod = allProducts.find((p) => p.id === pid);
    if (!prod) return;
    const qty = Math.max(0.001, Number(productQty) || 1);
    setComboLines((prev) => [
      ...prev,
      {
        product_id: pid,
        name: prod.name,
        sku: prod.sku || '',
        quantity: qty,
      },
    ]);
    setProductPick('');
    setProductQty('1');
    setError('');
  };

  const removeLine = (productId) => {
    setComboLines((prev) => prev.filter((l) => l.product_id !== productId));
  };

  const onSave = async () => {
    setError('');
    if (!form.name.trim()) {
      setError('Combo name is required');
      return;
    }
    if (!comboLines.length) {
      setError('Add at least one product in Product Details');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...form,
        price: form.price === '' ? 0 : Number(form.price),
        discount: form.discount === '' ? 0 : Number(form.discount),
        sort_sequence: form.sort_sequence === '' ? 0 : Number(form.sort_sequence),
        category_id: form.category_id || null,
        sub_category_id: form.sub_category_id || null,
        tax_id: form.tax_id || null,
        products: comboLines.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
        })),
      };

      const res = await fetch('/api/catalog/combos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) {
        const msg =
          json.errors?.name ||
          json.errors?.products ||
          json.message ||
          'Failed to save combo';
        throw new Error(msg);
      }
      router.push('/catalog/promos/combos');
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
        <Link href="/catalog/promos/combos" className="text-blue-600 hover:underline">
          Combos
        </Link>
        <span>›</span>
        <span className="font-medium text-gray-700">Create Combo</span>
      </nav>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-gray-900">Create Combo</h1>
          <p className="mt-1 text-sm text-gray-500">
            Fill in combo details and add products.{' '}
            <a href="#" className="text-blue-600 hover:underline">
              Need Help?
            </a>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/catalog/promos/combos"
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

      <Section title="Basic Information">
        <div className="grid gap-6 lg:grid-cols-[140px_1fr]">
          <div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-[120px] w-[120px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 text-gray-500 hover:border-blue-400 hover:bg-blue-50/30"
            >
              {form.image_url ? (
                <img src={form.image_url} alt="" className="h-full w-full rounded-lg object-cover" />
              ) : (
                <>
                  <span className="text-2xl text-blue-500">+</span>
                  <span className="mt-1 text-xs">Add Image</span>
                </>
              )}
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Combo Name" required>
              <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Combo Type">
              <select className={inputCls} value={form.combo_type} onChange={(e) => set('combo_type', e.target.value)}>
                <option value="">Select</option>
                {COMBO_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Combo Code">
              <input className={inputCls} value={form.combo_code} onChange={(e) => set('combo_code', e.target.value)} />
            </Field>
            <Field label="Category">
              <select
                className={inputCls}
                value={form.category_id}
                onChange={(e) => {
                  set('category_id', e.target.value);
                  set('sub_category_id', '');
                }}
              >
                <option value="">Select</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Combo Description" className="md:col-span-2">
              <textarea
                className={`${inputCls} min-h-[88px]`}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>
            <Field label="Sub Category">
              <select
                className={inputCls}
                value={form.sub_category_id}
                onChange={(e) => set('sub_category_id', e.target.value)}
                disabled={!form.category_id && filteredSubCategories.length === 0}
              >
                <option value="">Select</option>
                {filteredSubCategories.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Food Type">
              <select className={inputCls} value={form.food_type} onChange={(e) => set('food_type', e.target.value)}>
                <option value="">Select</option>
                {FOOD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Pricing Information">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Price">
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputCls}
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
            />
          </Field>
          <Field label="HSN">
            <input className={inputCls} value={form.hsn} onChange={(e) => set('hsn', e.target.value)} />
          </Field>
          <div className="flex flex-col justify-end">
            <label className="mb-2 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.tax_inclusive}
                onChange={(e) => set('tax_inclusive', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Tax Inclusive
            </label>
          </div>
          <Field label="Effective Date">
            <input
              type="date"
              className={inputCls}
              value={form.effective_date}
              onChange={(e) => set('effective_date', e.target.value)}
            />
          </Field>
          <Field label="Discount">
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputCls}
              value={form.discount}
              onChange={(e) => set('discount', e.target.value)}
            />
          </Field>
          <Field label="Tax">
            <select className={inputCls} value={form.tax_id} onChange={(e) => set('tax_id', e.target.value)}>
              <option value="">Select</option>
              {taxes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.rate != null ? ` (${t.rate}%)` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="SKU">
            <input className={inputCls} value={form.sku} onChange={(e) => set('sku', e.target.value)} />
          </Field>
          <Field label="Barcode">
            <input className={inputCls} value={form.barcode} onChange={(e) => set('barcode', e.target.value)} />
          </Field>
          <Field label="Sort Sequence">
            <input
              type="number"
              className={inputCls}
              value={form.sort_sequence}
              onChange={(e) => set('sort_sequence', e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Store Wise Pricing"
        action={
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.store_wise_pricing}
              onChange={(e) => set('store_wise_pricing', e.target.checked)}
              className="sr-only peer"
            />
            <span
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                form.store_wise_pricing ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
                  form.store_wise_pricing ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </span>
          </label>
        }
      >
        <p className="text-sm text-gray-500">
          {form.store_wise_pricing
            ? 'Store-wise pricing is enabled. Configure per-store prices when that module is available.'
            : 'Use the same combo price across all stores.'}
        </p>
      </Section>

      <Section
        title="Product Details"
        action={
          <button
            type="button"
            onClick={addProductLine}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            Add Product
          </button>
        }
      >
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-gray-200 bg-slate-50/80 p-4">
          <Field label="Product" className="min-w-[200px] flex-1">
            <select className={inputCls} value={productPick} onChange={(e) => setProductPick(e.target.value)}>
              <option value="">Select product</option>
              {availableProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.sku ? ` (${p.sku})` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity" className="w-28">
            <input
              type="number"
              min="0.001"
              step="0.001"
              className={inputCls}
              value={productQty}
              onChange={(e) => setProductQty(e.target.value)}
            />
          </Field>
        </div>

        {comboLines.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-gray-100 bg-slate-50/50 py-14 text-center">
            <div className="mb-3 text-4xl text-slate-300">📄</div>
            <p className="font-medium text-gray-700">No Product Yet Created!</p>
            <p className="mt-1 max-w-md text-sm text-gray-500">
              Product will be listed here once you Add Product.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium">Product</th>
                  <th className="px-3 py-2.5 text-left font-medium">SKU</th>
                  <th className="px-3 py-2.5 text-left font-medium">Qty</th>
                  <th className="px-3 py-2.5 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {comboLines.map((line) => (
                  <tr key={line.product_id} className="border-t border-gray-100">
                    <td className="px-3 py-2.5">{line.name}</td>
                    <td className="px-3 py-2.5 text-gray-600">{line.sku || '—'}</td>
                    <td className="px-3 py-2.5">{line.quantity}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => removeLine(line.product_id)}
                        className="text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
