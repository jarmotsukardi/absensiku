import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MapPin, Menu, X } from "lucide-react";

export function NavigationBar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/60 shadow-soft">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-[4.25rem]">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <MapPin className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-extrabold tracking-tight text-foreground">AbsensiKu</span>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-8">
            <a href="/#fitur" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors animated-underline">
              Fitur
            </a>
            <a href="/#harga" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors animated-underline">
              Harga
            </a>
            <a href="/#faq" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors animated-underline">
              FAQ
            </a>
            <Link to="/about" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors animated-underline">
              Tentang
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link to="/auth">
              <Button variant="ghost">Masuk Pegawai</Button>
            </Link>
            <Link to="/org/login?mode=register">
              <Button variant="gold">Daftar Gratis</Button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-card border-t border-border animate-slide-in-up">
          <div className="container mx-auto px-4 py-4 space-y-4">
            <a href="/#fitur" className="block text-foreground py-2" onClick={() => setMobileMenuOpen(false)}>
              Fitur
            </a>
            <a href="/#harga" className="block text-foreground py-2" onClick={() => setMobileMenuOpen(false)}>
              Harga
            </a>
            <a href="/#faq" className="block text-foreground py-2" onClick={() => setMobileMenuOpen(false)}>
              FAQ
            </a>
            <Link to="/about" className="block text-foreground py-2" onClick={() => setMobileMenuOpen(false)}>
              Tentang
            </Link>
            <div className="pt-4 space-y-2">
              <Link to="/auth" className="block">
                <Button variant="outline" className="w-full">
                  Masuk Pegawai
                </Button>
              </Link>
              <Link to="/org/login?mode=register" className="block">
                <Button variant="gold" className="w-full">
                  Daftar Gratis
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
