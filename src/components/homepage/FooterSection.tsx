import { useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Lock, Facebook, Instagram, Twitter, Youtube, Linkedin, MessageCircle, Send, Mail, Phone, MapPinned } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { FooterSettings } from "@/hooks/useHomepageData";
import DOMPurify from "dompurify";

interface FooterSectionProps {
  settings: FooterSettings;
}

const isValidLink = (url?: string) => {
  if (!url) return false;
  const trimmedUrl = url.trim();
  if (!trimmedUrl || trimmedUrl === "#" || trimmedUrl.toLowerCase().startsWith("javascript:")) {
    return false;
  }
  return true;
};

export function FooterSection({ settings }: FooterSectionProps) {
  const [showTermsDialog, setShowTermsDialog] = useState(false);
  const [termsContent, setTermsContent] = useState<{ title: string; content: string } | null>(null);
  const quickLinks = Array.isArray(settings.quick_links) ? settings.quick_links : [];
  const legalLinks = Array.isArray(settings.legal_links) ? settings.legal_links : [];

  // Handler untuk legal links yang butuh overlay
  const handleLegalLinkClick = (link: { label: string; url: string; content?: string }) => {
    // Jika link punya content, tampilkan overlay
    if (link.content) {
      setTermsContent({ title: link.label, content: link.content });
      setShowTermsDialog(true);
      return;
    }
    // Jika url dimulai dengan # atau bukan path internal, biarkan default behavior
  };

  // Check if any contact info is available
  const hasContactInfo = settings.address || settings.email || settings.phone || settings.whatsapp;

  // Check if social media is available
  const hasSocialMedia =
    isValidLink(settings.social_facebook) ||
    isValidLink(settings.social_instagram) ||
    isValidLink(settings.social_twitter) ||
    isValidLink(settings.social_youtube) ||
    isValidLink(settings.social_linkedin) ||
    isValidLink(settings.social_tiktok) ||
    isValidLink(settings.social_telegram);

  return (
    <>
      <footer id="tentang" className="bg-muted/30 border-t border-border py-12 px-4">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Company Info */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="text-xl font-bold">{settings.company_name}</span>
              </div>
              <p className="text-muted-foreground text-sm">{settings.company_description}</p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-semibold mb-4">Menu Cepat</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {quickLinks.map((link) => (
                  <li key={link.id}>
                    {!isValidLink(link.url) ? (
                      <span className="text-muted-foreground/60">{link.label}</span>
                    ) : link.url.startsWith("/") ? (
                      <Link to={link.url} className="hover:text-foreground transition-colors">
                        {link.label}
                      </Link>
                    ) : link.url.startsWith("#") ? (
                      <a href={link.url} className="hover:text-foreground transition-colors">
                        {link.label}
                      </a>
                    ) : (
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal Links */}
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {legalLinks.map((link) => (
                  <li key={link.id}>
                    {link.content ? (
                      <button
                        onClick={() => handleLegalLinkClick(link)}
                        className="hover:text-foreground transition-colors text-left"
                      >
                        {link.label}
                      </button>
                    ) : !isValidLink(link.url) ? (
                      <span className="text-muted-foreground/60">{link.label}</span>
                    ) : link.url.startsWith("/") ? (
                      <Link to={link.url} className="hover:text-foreground transition-colors">
                        {link.label}
                      </Link>
                    ) : (
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact Info or Social Media */}
            <div>
              {/* Contact Info (if available) */}
              {hasContactInfo && (
                <div className="mb-6">
                  <h4 className="font-semibold mb-4">Hubungi Kami</h4>
                  <ul className="space-y-3 text-sm text-muted-foreground">
                    {settings.address && (
                      <li className="flex items-start gap-2">
                        <MapPinned className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{settings.address}</span>
                      </li>
                    )}
                    {settings.email && (
                      <li className="flex items-center gap-2">
                        <Mail className="w-4 h-4 shrink-0" />
                        <a href={`mailto:${settings.email}`} className="hover:text-foreground transition-colors">
                          {settings.email}
                        </a>
                      </li>
                    )}
                    {settings.phone && (
                      <li className="flex items-center gap-2">
                        <Phone className="w-4 h-4 shrink-0" />
                        <a href={`tel:${settings.phone}`} className="hover:text-foreground transition-colors">
                          {settings.phone}
                        </a>
                      </li>
                    )}
                    {settings.whatsapp && (
                      <li className="flex items-center gap-2">
                        <MessageCircle className="w-4 h-4 shrink-0" />
                        <a 
                          href={`https://wa.me/${settings.whatsapp}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="hover:text-foreground transition-colors"
                        >
                          WhatsApp
                        </a>
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* Social Media Links */}
              {hasSocialMedia && (
                <div>
                  <h4 className="font-semibold mb-4">Ikuti Kami</h4>
                  <div className="flex gap-3 flex-wrap">
                    {isValidLink(settings.social_facebook) && (
                      <a href={settings.social_facebook} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-muted hover:bg-primary/10 transition-colors" aria-label="Facebook">
                        <Facebook className="w-5 h-5" />
                      </a>
                    )}
                    {isValidLink(settings.social_instagram) && (
                      <a href={settings.social_instagram} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-muted hover:bg-primary/10 transition-colors" aria-label="Instagram">
                        <Instagram className="w-5 h-5" />
                      </a>
                    )}
                    {isValidLink(settings.social_twitter) && (
                      <a href={settings.social_twitter} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-muted hover:bg-primary/10 transition-colors" aria-label="Twitter">
                        <Twitter className="w-5 h-5" />
                      </a>
                    )}
                    {isValidLink(settings.social_youtube) && (
                      <a href={settings.social_youtube} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-muted hover:bg-primary/10 transition-colors" aria-label="YouTube">
                        <Youtube className="w-5 h-5" />
                      </a>
                    )}
                    {isValidLink(settings.social_linkedin) && (
                      <a href={settings.social_linkedin} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-muted hover:bg-primary/10 transition-colors" aria-label="LinkedIn">
                        <Linkedin className="w-5 h-5" />
                      </a>
                    )}
                    {isValidLink(settings.social_tiktok) && (
                      <a href={settings.social_tiktok} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-muted hover:bg-primary/10 transition-colors" aria-label="TikTok">
                        <MessageCircle className="w-5 h-5" />
                      </a>
                    )}
                    {isValidLink(settings.social_telegram) && (
                      <a href={settings.social_telegram} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-muted hover:bg-primary/10 transition-colors" aria-label="Telegram">
                        <Send className="w-5 h-5" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Copyright */}
          <div className="border-t border-border mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">{settings.copyright_text}</p>
            <div className="flex items-center gap-4">
              <Lock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Data terenkripsi & aman</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Legal Content Dialog */}
      <Dialog open={showTermsDialog} onOpenChange={setShowTermsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{termsContent?.title || "Syarat & Ketentuan"}</DialogTitle>
            <DialogDescription>Silakan baca dengan seksama</DialogDescription>
          </DialogHeader>
          <div className="legal-content-preview prose prose-sm dark:prose-invert max-w-none prose-headings:font-semibold prose-headings:text-foreground prose-p:text-muted-foreground prose-p:leading-relaxed prose-li:text-muted-foreground prose-strong:text-foreground prose-a:text-primary">
            {termsContent?.content ? (
              <div dangerouslySetInnerHTML={{ 
                __html: DOMPurify.sanitize(termsContent.content, {
                  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'span', 'div'],
                  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'src', 'alt', 'width', 'height', 'style'],
                  ALLOW_DATA_ATTR: false
                }) 
              }} />
            ) : (
              <p className="text-muted-foreground">Konten tidak tersedia.</p>
            )}
          </div>
          <div className="flex justify-end pt-4">
            <Button onClick={() => setShowTermsDialog(false)}>Tutup</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
