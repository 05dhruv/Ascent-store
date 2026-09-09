'use client';

/**
 * WhatsAppReceiptToggle
 *
 * Drop this component into your POS customer-details section.
 * It shows a green WhatsApp toggle that appears only when a valid
 * Indian mobile number has been entered.
 *
 * Usage:
 *   <WhatsAppReceiptToggle
 *     mobile={customerMobile}           // current value in the mobile input
 *     enabled={sendWhatsapp}            // boolean state
 *     onChange={setSendWhatsapp}        // setter
 *   />
 *
 * Then pass `sendWhatsapp` in the bill POST body:
 *   { ..., sendWhatsapp: sendWhatsapp }
 */

const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;

function isValidIndianMobile(raw = '') {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return INDIAN_MOBILE_RE.test(digits);
  if (digits.length === 12 && digits.startsWith('91')) return INDIAN_MOBILE_RE.test(digits.slice(2));
  return false;
}

export default function WhatsAppReceiptToggle({ mobile = '', enabled, onChange }) {
  const hasValidMobile = isValidIndianMobile(mobile);

  // Auto-enable when a valid number is entered, auto-disable when cleared
  // (parent controls the state — this just provides the UI)
  if (!hasValidMobile) return null;

  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[12.5px] font-medium
        transition-all duration-150 select-none
        ${enabled
          ? 'bg-green-50 border-green-300 text-green-700'
          : 'bg-gray-50 border-gray-200 text-gray-400'
        }
      `}
      title={enabled ? 'WhatsApp receipt will be sent' : 'Click to enable WhatsApp receipt'}
    >
      {/* WhatsApp icon (inline SVG — no extra package needed) */}
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`w-3.5 h-3.5 flex-shrink-0 ${enabled ? 'text-green-600' : 'text-gray-300'}`}
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>

      {enabled ? 'Send WhatsApp receipt' : 'WhatsApp receipt off'}

      {/* Toggle pill */}
      <span
        className={`
          ml-0.5 w-7 h-4 rounded-full relative inline-block transition-colors duration-150
          ${enabled ? 'bg-green-500' : 'bg-gray-300'}
        `}
      >
        <span
          className={`
            absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all duration-150
            ${enabled ? 'left-3.5' : 'left-0.5'}
          `}
        />
      </span>
    </button>
  );
}
