import CreditPurchasePage from '@/components/CreditPurchasePage';

export default function SmsCreditPage() {
  return (
    <CreditPurchasePage
      creditLabel="SMS"
      pageTitle="SMS Credit Purchase"
      description="Description of the SMS Credit is to mentioned here"
      apiBase="/api/customer-sms-credit"
      buttonLabel="Buy SMS"
      modalTitle="Buy SMS"
    />
  );
}