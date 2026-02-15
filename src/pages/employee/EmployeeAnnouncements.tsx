import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Megaphone, ArrowLeft, Pin } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import DOMPurify from "dompurify";

interface Announcement {
  id: string;
  title: string;
  content?: string;
  image_url?: string | null;
  is_pinned?: boolean;
  created_at: string;
}

interface EmployeeAnnouncementsProps {
  tenantId?: string;
  onBack: () => void;
}

const ANNOUNCEMENT_CACHE_TTL_MS = 5 * 60 * 1000;
const announcementCache = new Map<string, { ts: number; items: Announcement[] }>();

export default function EmployeeAnnouncements({ tenantId, onBack }: EmployeeAnnouncementsProps) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<Announcement | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const itemsPerPage = 10;

  const fetchAnnouncements = useCallback(async () => {
    const cacheKey = `announcements:${tenantId || "-"}`;
    const cached = announcementCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < ANNOUNCEMENT_CACHE_TTL_MS) {
      setItems(cached.items);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Fetch from new announcements table (not news table)
      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, image_url, is_pinned, created_at")
        .eq("tenant_id", tenantId!)
        .eq("is_published", true)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      const rows = data || [];
      setItems(rows);
      announcementCache.set(cacheKey, { ts: Date.now(), items: rows });
    } catch (error) {
      console.error("Error fetching announcements:", error);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) fetchAnnouncements();
  }, [tenantId, fetchAnnouncements]);

  const filtered = items.filter(item =>
    !searchQuery || item.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const openDetail = async (item: Announcement) => {
    setSelectedItem(item);
    if (item.content) return;
    setIsDetailLoading(true);
    try {
      const { data, error } = await supabase
        .from("announcements")
        .select("content")
        .eq("id", item.id)
        .maybeSingle();
      if (error) throw error;
      const content = data?.content || "";
      setSelectedItem((prev) => (prev && prev.id === item.id ? { ...prev, content } : prev));
      setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, content } : it)));
    } catch (error) {
      console.error("Error fetching announcement detail:", error);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const relatedItems = selectedItem
    ? items.filter((item) => item.id !== selectedItem.id).slice(0, 4)
    : [];

  if (selectedItem) {
    return (
      <div className="space-y-4 pb-20">
        <Button variant="ghost" size="sm" onClick={() => setSelectedItem(null)}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Kembali
        </Button>
        {selectedItem.image_url && (
          <div className="aspect-video rounded-xl overflow-hidden">
            <img src={selectedItem.image_url} alt={selectedItem.title} className="w-full h-full object-cover" />
          </div>
        )}
        <div>
          {selectedItem.is_pinned && (
            <Badge variant="secondary" className="mb-2">
              <Pin className="w-3 h-3 mr-1" /> Disematkan
            </Badge>
          )}
          <h1 className="text-xl font-bold">{selectedItem.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {format(new Date(selectedItem.created_at), "dd MMMM yyyy", { locale: idLocale })}
          </p>
        </div>
        {isDetailLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(selectedItem.content || "<p>Konten tidak tersedia.</p>", {
                ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'img'],
                ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel'],
                ALLOW_DATA_ATTR: false,
              }),
            }}
          />
        )}

        {relatedItems.length > 0 && (
          <div className="mt-8 border-t pt-5">
            <div className="mb-3">
              <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                Pengumuman Lainnya
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {relatedItems.map((item) => (
                <Card
                  key={item.id}
                  className="group cursor-pointer border-border/70 transition-all hover:-translate-y-0.5 hover:shadow-md"
                  onClick={() => openDetail(item)}
                >
                  <CardContent className="p-3">
                    <div className="flex gap-3">
                      {item.image_url && (
                        <div className="h-14 w-14 overflow-hidden rounded-md bg-muted flex-shrink-0">
                          <img
                            src={item.image_url}
                            alt={item.title}
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="mb-1 flex items-center gap-2">
                          {item.is_pinned && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              <Pin className="w-2.5 h-2.5 mr-0.5" /> Pinned
                            </Badge>
                          )}
                        </div>
                        <p className="line-clamp-2 text-sm font-medium leading-snug">{item.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {format(new Date(item.created_at), "dd MMM yyyy", { locale: idLocale })}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary" />
            Pengumuman
          </h2>
          <p className="text-xs text-muted-foreground">Pengumuman dari organisasi Anda</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Cari pengumuman..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : paginated.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          {searchQuery ? "Tidak ada hasil pencarian" : "Belum ada pengumuman"}
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {paginated.map(item => (
            <Card key={item.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openDetail(item)}>
              <CardContent className="p-4 flex gap-4">
                {item.image_url && (
                  <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                    <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {item.is_pinned && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        <Pin className="w-2.5 h-2.5 mr-0.5" /> Pinned
                      </Badge>
                    )}
                  </div>
                  <h3 className="font-medium text-sm line-clamp-2">{item.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    Klik untuk membaca detail pengumuman
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(item.created_at), "dd MMM yyyy", { locale: idLocale })}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
            Sebelumnya
          </Button>
          <span className="flex items-center text-sm px-3">Hal {currentPage}/{totalPages}</span>
          <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
            Selanjutnya
          </Button>
        </div>
      )}
    </div>
  );
}
