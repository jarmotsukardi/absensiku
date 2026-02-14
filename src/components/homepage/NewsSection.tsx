import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Newspaper } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { useState, useEffect } from "react";
import DOMPurify from "dompurify";
import { supabase } from "@/integrations/supabase/client";
import type { Article, NewsSettings } from "@/hooks/useHomepageData";

interface NewsSectionProps {
  articles: Article[];
  settings: NewsSettings;
}

export function NewsSection({ articles, settings }: NewsSectionProps) {
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [articleContent, setArticleContent] = useState<string>("");

  useEffect(() => {
    if (selectedArticle) {
      supabase.from("articles").select("content").eq("id", selectedArticle.id).single()
        .then(({ data }) => setArticleContent(data?.content || ""));
    } else {
      setArticleContent("");
    }
  }, [selectedArticle]);

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
            <Card 
              key={article.id} 
              className="group overflow-hidden border-border/50 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer"
              onClick={() => setSelectedArticle(article)}
            >
              {article.image_url && (
                <div className="h-48 overflow-hidden">
                  <img src={article.image_url} alt={article.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                </div>
              )}
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 mb-2">
                  {settings.show_category && article.category && <Badge variant="secondary" className="text-xs">{article.category}</Badge>}
                  {settings.show_date && article.published_at && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(article.published_at), "d MMM yyyy", { locale: id })}
                    </span>
                  )}
                </div>
                <CardTitle className="text-lg line-clamp-2 group-hover:text-primary transition-colors">{article.title}</CardTitle>
              </CardHeader>
              <CardContent>
                {settings.show_excerpt && article.excerpt && <CardDescription className="line-clamp-2 mb-4">{article.excerpt}</CardDescription>}
                <Button variant="link" className="p-0 h-auto text-primary">Baca selengkapnya</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={!!selectedArticle} onOpenChange={() => setSelectedArticle(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-2">
              {selectedArticle?.category && <Badge variant="secondary">{selectedArticle.category}</Badge>}
              {selectedArticle?.published_at && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(selectedArticle.published_at), "d MMMM yyyy", { locale: id })}
                </span>
              )}
            </div>
            <DialogTitle className="text-xl">{selectedArticle?.title}</DialogTitle>
          </DialogHeader>
          {selectedArticle?.image_url && (
            <div className="rounded-lg overflow-hidden mb-4">
              <img src={selectedArticle.image_url} alt={selectedArticle.title} className="w-full h-auto object-cover max-h-80" />
            </div>
          )}
          <div className="prose prose-sm max-w-none text-foreground" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(articleContent) }} />
        </DialogContent>
      </Dialog>
    </section>
  );
}