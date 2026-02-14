import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowLeft, 
  Calendar, 
  Building2, 
  Share2, 
  Facebook, 
  Twitter,
  Copy,
  Check,
  Newspaper
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Helmet } from "react-helmet-async";
import DOMPurify from "dompurify";

interface ArticleData {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  excerpt: string | null;
  category: string | null;
  published_at: string | null;
  created_at: string;
}

export default function NewsDetail() {
  const { id } = useParams<{ id: string }>();
  const [article, setArticle] = useState<ArticleData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (id) {
      fetchArticle();
    }
  }, [id]);

  const fetchArticle = async () => {
    try {
      // First try to find by slug
      let { data, error } = await supabase
        .from("articles")
        .select(`
          id,
          title,
          content,
          image_url,
          excerpt,
          category,
          published_at,
          created_at
        `)
        .eq("slug", id)
        .eq("is_published", true)
        .maybeSingle();

      // If not found by slug, try by ID
      if (!data && id) {
        const { data: dataById, error: errorById } = await supabase
          .from("articles")
          .select(`
            id,
            title,
            content,
            image_url,
            excerpt,
            category,
            published_at,
            created_at
          `)
          .eq("id", id)
          .eq("is_published", true)
          .maybeSingle();
        
        data = dataById;
        error = errorById;
      }

      if (error) throw error;
      setArticle(data);
    } catch (error) {
      console.error("Error fetching article:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const shareToFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, "_blank");
  };

  const shareToTwitter = () => {
    const text = article?.title || "Berita";
    window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`, "_blank");
  };

  const stripHtml = (html: string) => {
    const tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Skeleton className="h-8 w-32 mb-8" />
          <Skeleton className="h-64 w-full mb-6 rounded-xl" />
          <Skeleton className="h-10 w-3/4 mb-4" />
          <Skeleton className="h-4 w-1/4 mb-8" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Newspaper className="w-8 h-8 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-bold mb-2">Artikel Tidak Ditemukan</h1>
            <p className="text-muted-foreground mb-6">
              Artikel atau berita yang Anda cari tidak ditemukan atau sudah dihapus.
            </p>
            <Link to="/">
              <Button>Kembali ke Beranda</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const excerpt = article.excerpt || stripHtml(article.content).substring(0, 160);
  const displayDate = article.published_at || article.created_at;

  return (
    <>
      <Helmet>
        <title>{article.title} | AbsensiKu</title>
        <meta name="description" content={excerpt} />
        <meta property="og:title" content={article.title} />
        <meta property="og:description" content={excerpt} />
        {article.image_url && <meta property="og:image" content={article.image_url} />}
        <meta property="og:type" content="article" />
        <meta property="og:url" content={shareUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={article.title} />
        <meta name="twitter:description" content={excerpt} />
        {article.image_url && <meta name="twitter:image" content={article.image_url} />}
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="sticky top-0 z-50 glass border-b border-border">
          <div className="container mx-auto px-4 h-16 flex items-center justify-between max-w-4xl">
            <Link to="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Kembali
              </Button>
            </Link>
            
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={handleCopyLink} title="Salin link">
                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={shareToFacebook} title="Share ke Facebook">
                <Facebook className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={shareToTwitter} title="Share ke Twitter">
                <Twitter className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Cover Image */}
          {article.image_url && (
            <div className="aspect-video w-full rounded-xl overflow-hidden mb-8">
              <img 
                src={article.image_url} 
                alt={article.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Title & Meta */}
          <article>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4 leading-tight">
              {article.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 mb-8 text-sm text-muted-foreground">
              {article.category && (
                <Badge variant="secondary">{article.category}</Badge>
              )}
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <time dateTime={displayDate}>
                  {format(new Date(displayDate), "EEEE, dd MMMM yyyy", { locale: idLocale })}
                </time>
              </div>
            </div>

            {/* Article Content */}
            <div 
              className="prose prose-lg max-w-none dark:prose-invert prose-headings:font-bold prose-a:text-primary prose-img:rounded-lg"
              dangerouslySetInnerHTML={{ 
                __html: DOMPurify.sanitize(article.content, {
                  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
                  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel', 'width', 'height', 'style'],
                  ALLOW_DATA_ATTR: false
                })
              }}
            />
          </article>

          {/* Share Section */}
          <div className="mt-12 pt-8 border-t border-border">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Share2 className="w-4 h-4" />
              Bagikan Artikel Ini
            </h3>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={handleCopyLink}>
                {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? "Tersalin!" : "Salin Link"}
              </Button>
              <Button variant="outline" onClick={shareToFacebook}>
                <Facebook className="w-4 h-4 mr-2" />
                Facebook
              </Button>
              <Button variant="outline" onClick={shareToTwitter}>
                <Twitter className="w-4 h-4 mr-2" />
                Twitter
              </Button>
            </div>
          </div>

          {/* Back to Home */}
          <div className="mt-8">
            <Link to="/">
              <Button variant="ghost" className="text-muted-foreground">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Kembali ke Beranda
              </Button>
            </Link>
          </div>
        </main>

        {/* Footer */}
        <footer className="py-8 border-t border-border mt-16">
          <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} AbsensiKu. Powered by AbsensiKu.
          </div>
        </footer>
      </div>
    </>
  );
}
