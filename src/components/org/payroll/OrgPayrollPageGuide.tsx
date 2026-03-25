import { Link, useLocation } from "react-router-dom";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildOrgPayrollOverlayHref } from "@/lib/orgPayrollOverlay";
import { getOrgPayrollPageGuide } from "@/lib/orgPayrollPageGuide";

type OrgPayrollPageGuideProps = {
  pathname: string;
};

export function OrgPayrollPageGuide({ pathname }: OrgPayrollPageGuideProps) {
  const location = useLocation();
  const guide = getOrgPayrollPageGuide(pathname);

  if (!guide) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Penjelasan Halaman</Badge>
          <Badge variant="outline">{guide.badge}</Badge>
        </div>
        <div className="space-y-1">
          <CardTitle className="text-lg">{guide.title}</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">{guide.summary}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-3">
          <GuideListCard title="Fokus Utama" items={guide.focusPoints} />
          <GuideListCard title="Kapan Dipakai" items={guide.useCases} />
          <GuideListCard title="Output Halaman" items={guide.outputs} />
        </div>
        {guide.watchouts?.length ? <GuideListCard title="Hal yang Perlu Diwaspadai" items={guide.watchouts} /> : null}
        {guide.relatedRoutes?.length ? (
          <div className="rounded-lg border bg-background/80 p-4">
            <p className="text-sm font-medium">Route Terkait</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {guide.relatedRoutes.map((item) => (
                <Link
                  key={item.path}
                  to={buildOrgPayrollOverlayHref(location.pathname, location.search, item.path)}
                  className="rounded-md border bg-card p-3 text-sm transition-colors hover:bg-muted/40"
                >
                  <p className="font-medium text-foreground">{item.label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.note}</p>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
        <Accordion type="single" collapsible defaultValue="glossary" className="rounded-lg border bg-background/80 px-4">
          <AccordionItem value="glossary" className="border-b-0">
            <AccordionTrigger className="py-3 text-sm">Glosarium Halaman</AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-3 md:grid-cols-2">
                {guide.glossary.map((item) => (
                  <div key={item.term} className="rounded-md border bg-card p-3">
                    <p className="text-sm font-medium">{item.term}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.definition}</p>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

function GuideListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border bg-background/80 p-4">
      <p className="text-sm font-medium">{title}</p>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
