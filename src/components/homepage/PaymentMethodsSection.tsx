import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CreditCard, ShieldCheck } from "lucide-react";

// Default Xendit payment method logos with reliable CDN URLs
const defaultPaymentMethods = {
  banks: [
    { id: "bca", name: "BCA", logo: "https://cdn.worldvectorlogo.com/logos/bca-bank-central-asia.svg" },
    { id: "bni", name: "BNI", logo: "https://cdn.worldvectorlogo.com/logos/bni-bank-negara-indonesia.svg" },
    { id: "bri", name: "BRI", logo: "https://cdn.worldvectorlogo.com/logos/bri-bank-rakyat-indonesia.svg" },
    { id: "mandiri", name: "Mandiri", logo: "https://cdn.worldvectorlogo.com/logos/bank-mandiri-logo-2.svg" },
    { id: "permata", name: "Permata", logo: "https://cdn.worldvectorlogo.com/logos/permatabank.svg" },
    { id: "cimb", name: "CIMB Niaga", logo: "https://cdn.worldvectorlogo.com/logos/cimb-niaga-1.svg" },
  ],
  ewallets: [
    { id: "ovo", name: "OVO", logo: "https://cdn.worldvectorlogo.com/logos/ovo-2.svg" },
    { id: "gopay", name: "GoPay", logo: "https://cdn.worldvectorlogo.com/logos/gopay-1.svg" },
    { id: "dana", name: "DANA", logo: "https://cdn.worldvectorlogo.com/logos/dana-2.svg" },
    { id: "shopeepay", name: "ShopeePay", logo: "https://cdn.worldvectorlogo.com/logos/shopeepay.svg" },
    { id: "linkaja", name: "LinkAja", logo: "https://cdn.worldvectorlogo.com/logos/linkaja.svg" },
  ],
  qris: [
    { id: "qris", name: "QRIS", logo: "https://cdn.worldvectorlogo.com/logos/qris.svg" },
  ],
  cards: [
    { id: "visa", name: "Visa", logo: "https://cdn.worldvectorlogo.com/logos/visa-2.svg" },
    { id: "mastercard", name: "Mastercard", logo: "https://cdn.worldvectorlogo.com/logos/mastercard-4.svg" },
    { id: "jcb", name: "JCB", logo: "https://cdn.worldvectorlogo.com/logos/jcb-2.svg" },
    { id: "amex", name: "American Express", logo: "https://cdn.worldvectorlogo.com/logos/american-express-1.svg" },
  ],
  retail: [
    { id: "alfamart", name: "Alfamart", logo: "https://cdn.worldvectorlogo.com/logos/alfamart.svg" },
    { id: "indomaret", name: "Indomaret", logo: "https://cdn.worldvectorlogo.com/logos/indomaret.svg" },
  ],
};

interface PaymentMethod {
  id: string;
  name: string;
  logo: string;
}

interface PaymentMethodsConfig {
  section_title: string;
  section_subtitle: string;
  show_banks: boolean;
  show_ewallets: boolean;
  show_qris: boolean;
  show_cards: boolean;
  show_retail: boolean;
  enabled_banks: string[];
  enabled_ewallets: string[];
  enabled_cards: string[];
  enabled_retail: string[];
  custom_methods?: PaymentMethod[];
}

const defaultConfig: PaymentMethodsConfig = {
  section_title: "Dukungan Metode Pembayaran",
  section_subtitle: "Pembayaran aman melalui Xendit Payment Gateway",
  show_banks: true,
  show_ewallets: true,
  show_qris: true,
  show_cards: true,
  show_retail: true,
  enabled_banks: defaultPaymentMethods.banks.map(b => b.id),
  enabled_ewallets: defaultPaymentMethods.ewallets.map(e => e.id),
  enabled_cards: defaultPaymentMethods.cards.map(c => c.id),
  enabled_retail: defaultPaymentMethods.retail.map(r => r.id),
  custom_methods: [],
};

export function PaymentMethodsSection() {
  const [config, setConfig] = useState<PaymentMethodsConfig>(defaultConfig);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "xendit_payment_methods_settings")
        .maybeSingle();

      if (data?.value) {
        setConfig({ ...defaultConfig, ...(data.value as Partial<PaymentMethodsConfig>) });
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return null;

  const enabledBanks = defaultPaymentMethods.banks.filter(b => config.enabled_banks.includes(b.id));
  const enabledEwallets = defaultPaymentMethods.ewallets.filter(e => config.enabled_ewallets.includes(e.id));
  const enabledCards = defaultPaymentMethods.cards.filter(c => config.enabled_cards.includes(c.id));
  const enabledRetail = defaultPaymentMethods.retail.filter(r => config.enabled_retail.includes(r.id));
  const customMethods = config.custom_methods || [];

  const hasAnyMethods = 
    (config.show_banks && enabledBanks.length > 0) ||
    (config.show_ewallets && enabledEwallets.length > 0) ||
    (config.show_qris) ||
    (config.show_cards && enabledCards.length > 0) ||
    (config.show_retail && enabledRetail.length > 0) ||
    customMethods.length > 0;

  if (!hasAnyMethods) return null;

  // Combine all payment methods into one array for compact display
  const allLogos: PaymentMethod[] = [];
  
  if (config.show_banks) allLogos.push(...enabledBanks);
  if (config.show_ewallets) allLogos.push(...enabledEwallets);
  if (config.show_qris) allLogos.push(...defaultPaymentMethods.qris);
  if (config.show_cards) allLogos.push(...enabledCards);
  if (config.show_retail) allLogos.push(...enabledRetail);
  if (customMethods.length > 0) allLogos.push(...customMethods);

  return (
    <section id="payment-methods" className="py-10 px-4 bg-muted/30">
      <div className="container mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium mb-3">
            <CreditCard className="w-3.5 h-3.5" />
            Metode Pembayaran
          </div>
          <h2 className="text-xl lg:text-2xl font-bold text-foreground mb-2">
            {config.section_title}
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            {config.section_subtitle}
          </p>
        </div>

        {/* Compact logo grid */}
        <div className="flex flex-wrap justify-center items-center gap-3 max-w-4xl mx-auto">
          {allLogos.map((method) => (
            <div
              key={method.id}
              className="bg-background rounded-md px-3 py-2 shadow-sm border hover:shadow-md transition-shadow flex items-center justify-center"
              title={method.name}
            >
              <img 
                src={method.logo} 
                alt={method.name} 
                className="h-5 w-auto max-w-[60px] object-contain"
                onError={(e) => {
                  // Fallback: show text if logo fails
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent && !parent.querySelector('span')) {
                    const span = document.createElement('span');
                    span.className = 'text-xs font-medium text-muted-foreground';
                    span.textContent = method.name;
                    parent.appendChild(span);
                  }
                }}
              />
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span>Pembayaran aman & terenkripsi</span>
        </div>
      </div>
    </section>
  );
}
