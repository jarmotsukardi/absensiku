import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Newspaper } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import type { Article, NewsSettings } from "@/hooks/useHomepageData";

interface NewsSectionProps {
  articles: Article[];
  settings: NewsSettings;
}

export function NewsSection({ articles, settings }: NewsSectionProps) {
  if (articles.length === 0) return null;

  return (
    <section className="py-20 px-4 bg-muted/30">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-4">
            <Newspaper className="w-4 h-4 text-primary" />
            <span className="text-foreground text-sm font-medium">Update Terbaru</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">{settings.title}</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">{settings.subtitle}</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {articles.slice(0, settings.max_display).map((article) => (
            <Link
              key={article.id}
              to={`/news/${article.slug || article.id}`}
              className="group block"
            >
              <Card className="overflow-hidden border-border/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                {article.image_url && (
                  <div className="h-48 overflow-hidden">
                    <img src={article.image_url} alt={article.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  </div>
                )}
                <CardHeader className="pb-2">
                  <div className="mb-2 flex items-center gap-2">
                    {settings.show_category && article.category && <Badge variant="secondary" className="text-xs">{article.category}</Badge>}
                    {settings.show_date && article.published_at && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(article.published_at), "d MMM yyyy", { locale: id })}
                      </span>
                    )}
                  </div>
                  <CardTitle className="line-clamp-2 text-lg transition-colors group-hover:text-primary">{article.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  {settings.show_excerpt && article.excerpt && <CardDescription className="mb-4 line-clamp-2">{article.excerpt}</CardDescription>}
                  <span className="text-sm font-medium text-primary">Baca selengkapnya</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Button asChild variant="outline">
            <Link to="/news">Lihat Semua Berita</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
