import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    
    // Redirect ke home setelah 3 detik
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate("/", { replace: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [location.pathname, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
        <p className="text-xl text-muted-foreground">Halaman tidak ditemukan</p>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Mengalihkan ke halaman utama dalam {countdown} detik...</span>
        </div>
        <a 
          href="/" 
          className="inline-block text-primary underline hover:text-primary/90"
          onClick={(e) => {
            e.preventDefault();
            navigate("/", { replace: true });
          }}
        >
          Klik di sini jika tidak dialihkan otomatis
        </a>
      </div>
    </div>
  );
};

export default NotFound;
