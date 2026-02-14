import { useState } from "react";
import { Newspaper } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

interface NewsThumbnailPreviewProps {
  imageUrl?: string;
  title: string;
}

export function NewsThumbnailPreview({ imageUrl, title }: NewsThumbnailPreviewProps) {
  const [imageError, setImageError] = useState(false);

  if (!imageUrl || imageError) {
    return (
      <div className="w-12 h-8 bg-muted rounded flex items-center justify-center">
        <Newspaper className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="cursor-pointer">
          <img
            src={imageUrl}
            alt={title}
            className="w-12 h-8 object-cover rounded transition-transform hover:scale-105"
            onError={() => setImageError(true)}
          />
        </div>
      </HoverCardTrigger>
      <HoverCardContent 
        side="right" 
        align="start" 
        className="w-auto p-2 bg-background/95 backdrop-blur-sm border shadow-lg"
      >
        <div className="space-y-2">
          <img
            src={imageUrl}
            alt={title}
            className="w-[340px] h-auto object-contain rounded-md"
            style={{ aspectRatio: "3.3 / 1" }}
          />
          <p className="text-xs text-muted-foreground text-center max-w-[340px] truncate">
            {title}
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
