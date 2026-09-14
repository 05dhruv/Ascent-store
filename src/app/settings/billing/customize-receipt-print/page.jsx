'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/MainLayout';

const DEFAULT_CONFIG = {
  businessName: 'Ascent Sync',
  subtitle: 'GST Invoice / POS Receipt',
  headerText: '',
  footerText: 'Thank you. Visit again.',
  template: 'thermal-80',
  printerName: '',
  paperWidthMm: 80,
  paperHeightMm: '',
  printMarginMm: 3,
  autoCloseAfterPrint: false,
  useCssPageSize: true,
  copies: 1,
  showTaxBreakup: true,
  showDiscount: true,
  showQr: true,
  showCustomerMobile: true,
  showSku: true,
  cutFeedLines: 1,
};

const PAPER_PRESETS = {
  'printer-default': { width: 80, height: '', margin: 3, useCssPageSize: false },
  'thermal-57': { width: 57, height: '', margin: 2, useCssPageSize: true },
  'thermal-58': { width: 58, height: '', margin: 2, useCssPageSize: true },
  'thermal-72': { width: 72, height: '', margin: 3, useCssPageSize: true },
  'thermal-76': { width: 76, height: '', margin: 3, useCssPageSize: true },
  'thermal-80': { width: 80, height: '', margin: 3, useCssPageSize: true },
  'thermal-82': { width: 82, height: '', margin: 3, useCssPageSize: true },
  a5: { width: 148, height: 210, margin: 8, useCssPageSize: true },
  a4: { width: 210, height: 297, margin: 10, useCssPageSize: true },
  letter: { width: 216, height: 279, margin: 10, useCssPageSize: true },
  custom: { width: 80, height: '', margin: 3, useCssPageSize: true },
};

function isSheetTemplate(template) {
  return ['a4', 'a5', 'letter'].includes(template);
}

function isThermalTemplate(template) {
  return String(template || '').startsWith('thermal-');
}

function canUseCssPageSize(template) {
  return template !== 'printer-default';
}

function normalizeConfig(config = {}) {
  const template = PAPER_PRESETS[config.template] ? config.template : DEFAULT_CONFIG.template;
  const preset = PAPER_PRESETS[template];
  return {
    ...DEFAULT_CONFIG,
    ...config,
    template,
    paperWidthMm: config.paperWidthMm || preset.width,
    paperHeightMm: isSheetTemplate(template) ? (config.paperHeightMm || preset.height || '') : '',
    printMarginMm: config.printMarginMm ?? preset.margin,
    useCssPageSize: canUseCssPageSize(template) && (isThermalTemplate(template) || (config.useCssPageSize == null ? preset.useCssPageSize !== false : Boolean(config.useCssPageSize))),
    cutFeedLines: Math.min(5, Math.max(0, Math.round(Number(config.cutFeedLines ?? DEFAULT_CONFIG.cutFeedLines) || 0))),
  };
}

export default function CustomizeReceiptPrintPage() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [recordId, setRecordId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch('/api/settings/customize-receipt-print?pageSize=1&isActive=true', { cache: 'no-store' });
        const json = await res.json();
        const record = json.data?.records?.[0];
        if (record) {
          setRecordId(record.id);
          setConfig(normalizeConfig(record.config || DEFAULT_CONFIG));
        }
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, []);

  const setField = (key, value) => setConfig((current) => {
    const next = { ...current, [key]: value };
    if (key === 'template') {
      const preset = PAPER_PRESETS[value] || PAPER_PRESETS.custom;
      next.paperWidthMm = preset.width;
      next.paperHeightMm = preset.height;
      next.printMarginMm = preset.margin;
      next.useCssPageSize = preset.useCssPageSize !== false;
    }
    return normalizeConfig(next);
  });

  const save = async () => {
    setSaving(true);
    try {
      const normalizedConfig = normalizeConfig(config);
      const res = await fetch('/api/settings/customize-receipt-print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: recordId,
          name: 'Default POS Receipt',
          code: 'default',
          description: 'Default receipt template used by POS print',
          isActive: true,
          config: normalizedConfig,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Save failed');
      setRecordId(json.data?.id || recordId);
      setConfig(normalizedConfig);
      setToast('Receipt print settings saved');
      setTimeout(() => setToast(''), 2500);
    } catch (err) {
      setToast(err.message || 'Unable to save receipt settings');
      setTimeout(() => setToast(''), 3500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl space-y-5">
        {toast && (
          <div className="fixed right-4 top-16 z-[999] rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-xl">
            {toast}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-blue-600">SETTINGS / BILLING</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Customize Receipt Print</h1>
            <p className="mt-1 text-sm text-slate-500">Configure the default receipt that prints from POS billing.</p>
          </div>
          <button
            onClick={save}
            disabled={saving || loading}
            className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-800 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Business Name">
                <input value={config.businessName} onChange={(e) => setField('businessName', e.target.value)} className="form-input" />
              </Field>
              <Field label="Subtitle">
                <input value={config.subtitle} onChange={(e) => setField('subtitle', e.target.value)} className="form-input" />
              </Field>
              <Field label="Template">
                <select value={config.template} onChange={(e) => setField('template', e.target.value)} className="form-input bg-white">
                  <option value="printer-default">Printer Default</option>
                  <option value="thermal-57">Thermal 57mm</option>
                  <option value="thermal-80">Thermal 80mm</option>
                  <option value="thermal-58">Thermal 58mm</option>
                  <option value="thermal-72">Thermal 72mm</option>
                  <option value="thermal-76">Thermal 76mm</option>
                  <option value="thermal-82">Thermal 82mm</option>
                  <option value="a5">A5 Invoice</option>
                  <option value="a4">A4 Invoice</option>
                  <option value="letter">Letter</option>
                  <option value="custom">Custom</option>
                </select>
              </Field>
              <Field label="Copies">
                <input type="number" min="1" max="5" value={config.copies} onChange={(e) => setField('copies', Math.max(1, Number(e.target.value || 1)))} className="form-input" />
              </Field>
              <Field label="Printer Name" wide>
                <input value={config.printerName || ''} onChange={(e) => setField('printerName', e.target.value)} placeholder="Example: TVS RP 3200, Epson TM-T82" className="form-input" />
              </Field>
              <Field label="Paper Width (mm)">
                <input type="number" min="40" max="300" value={config.paperWidthMm} onChange={(e) => setField('paperWidthMm', e.target.value)} className="form-input" />
              </Field>
              <Field label="Paper Height (sheet only)">
                <input type="number" min="20" max="1000" value={config.paperHeightMm} disabled={!isSheetTemplate(config.template)} onChange={(e) => setField('paperHeightMm', e.target.value)} placeholder="Auto" className="form-input disabled:bg-slate-50 disabled:text-slate-400" />
              </Field>
              <Field label="Print Margin (mm)">
                <input type="number" min="0" max="25" value={config.printMarginMm} onChange={(e) => setField('printMarginMm', e.target.value)} className="form-input" />
              </Field>
              <Field label="Paper Feed After Receipt">
                <input type="number" min="0" max="5" value={config.cutFeedLines} onChange={(e) => setField('cutFeedLines', e.target.value)} className="form-input" />
              </Field>
              <Field label="Header Text" wide>
                <textarea value={config.headerText} onChange={(e) => setField('headerText', e.target.value)} rows={3} className="form-input" />
              </Field>
              <Field label="Footer Text" wide>
                <textarea value={config.footerText} onChange={(e) => setField('footerText', e.target.value)} rows={3} className="form-input" />
              </Field>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                ['showTaxBreakup', 'Show tax breakup'],
                ['showDiscount', 'Show discount'],
                ['showQr', 'Show digital invoice QR'],
                ['showCustomerMobile', 'Show customer mobile'],
                ['showSku', 'Show item SKU'],
                ['useCssPageSize', 'Apply software paper size'],
                ['autoCloseAfterPrint', 'Close print tab after print'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3">
                  <span className="text-sm font-semibold text-slate-800">{label}</span>
                  <input type="checkbox" checked={!!config[key]} onChange={(e) => setField(key, e.target.checked)} className="h-5 w-5 accent-blue-700" />
                </label>
              ))}
            </div>
          </section>

          <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-black text-slate-900">Preview</p>
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-700">
              <h2 className="text-lg font-black text-slate-950">{config.businessName || 'Store Name'}</h2>
              <p className="text-slate-500">{config.subtitle}</p>
              {config.headerText && <p className="mt-2 whitespace-pre-line">{config.headerText}</p>}
              <div className="my-3 border-t border-dashed border-slate-300" />
              <div className="text-left">
                <p><strong>Bill:</strong> POS-0001</p>
                <p><strong>Customer:</strong> Walk-in Customer</p>
              </div>
              <div className="my-3 border-t border-dashed border-slate-300" />
              <div className="flex justify-between"><span>Sample Item</span><strong>Rs.100.00</strong></div>
              {config.showTaxBreakup && <div className="mt-2 flex justify-between"><span>Tax</span><strong>Rs.5.00</strong></div>}
              <div className="mt-2 flex justify-between text-base font-black text-blue-700"><span>Total</span><span>Rs.105.00</span></div>
              {config.showQr && <div className="mx-auto mt-4 h-16 w-16 rounded border border-slate-300 bg-white" />}
              <p className="mt-3 whitespace-pre-line text-slate-500">{config.footerText}</p>
            </div>
          </aside>
        </div>
      </div>
    </MainLayout>
  );
}

function Field({ label, wide = false, children }) {
  return (
    <label className={wide ? 'block sm:col-span-2' : 'block'}>
      <span className="mb-1 block text-xs font-bold text-slate-600">{label}</span>
      {children}
    </label>
  );
}
