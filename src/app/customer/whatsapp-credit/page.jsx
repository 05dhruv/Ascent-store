import CreditPurchasePage from '@/components/CreditPurchasePage';

export default function WhatsappCreditPage() {
  return (
    <CreditPurchasePage
      creditLabel="WhatsApp"
      pageTitle="WhatsApp Credit Purchase"
      description="Description of the WhatsApp Credit is to mentioned here"
      apiBase="/api/customer-whatsapp-credit"
      buttonLabel="Buy WhatsApp"
      modalTitle="Buy WhatsApp"
    />
  );
}