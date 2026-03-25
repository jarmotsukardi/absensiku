import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MapPin, Menu, X } from "lucide-react";
import { APK_DOWNLOAD_PAGE_PATH } from "@/lib/apkDownload";
import { PUBLIC_CONSULTATION_PATH } from "@/lib/publicRoutes";

export function NavigationBar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const linkClassName = (isActive: boolean) =>
    `text-sm font-medium transition-colors animated-underline ${
      isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
    }`;

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
          <div className="hidden md:flex items-center gap-6 lg:gap-7">
            <Link to="/" className={linkClassName(location.pathname === "/")}>
              Beranda
            </Link>
            <a href="/#harga" className={linkClassName(false)}>
              Harga
            </a>
            <Link to={PUBLIC_CONSULTATION_PATH} className={linkClassName(location.pathname === PUBLIC_CONSULTATION_PATH)}>
              Konsultasi
            </Link>
            <a href="/#faq" className={linkClassName(false)}>
              FAQ
            </a>
            <Link
              to={APK_DOWNLOAD_PAGE_PATH}
              className={linkClassName(location.pathname === APK_DOWNLOAD_PAGE_PATH)}
            >
              Download
            </Link>
            <Link to="/about" className={linkClassName(location.pathname === "/about")}>
              Tentang
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <Link to="/auth">
              <Button variant="ghost" className="px-3 lg:px-4">Masuk Pegawai</Button>
            </Link>
            <Link to="/org/login?mode=register">
              <Button variant="gold" className="px-4 lg:px-5">Daftar Gratis</Button>
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
            <Link to="/" className="block text-foreground py-2" onClick={() => setMobileMenuOpen(false)}>
              Beranda
            </Link>
            <a href="/#harga" className="block text-foreground py-2" onClick={() => setMobileMenuOpen(false)}>
              Harga
            </a>
            <Link to={PUBLIC_CONSULTATION_PATH} className="block text-foreground py-2" onClick={() => setMobileMenuOpen(false)}>
              Konsultasi
            </Link>
            <a href="/#faq" className="block text-foreground py-2" onClick={() => setMobileMenuOpen(false)}>
              FAQ
            </a>
            <Link
              to={APK_DOWNLOAD_PAGE_PATH}
              className="block text-foreground py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Download
            </Link>
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
