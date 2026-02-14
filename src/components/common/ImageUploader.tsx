import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, Loader2, X, Image as ImageIcon, Crop } from "lucide-react";
import { ImageCropper } from "./ImageCropper";

interface ImageUploaderProps {
  currentImageUrl?: string;
  folder?: string;
  onUploadComplete: (url: string) => void;
  label?: string;
  bucket?: string;
  aspectRatio?: "square" | "video" | "wide" | "news";
  enableCrop?: boolean;
}

export function ImageUploader({
  currentImageUrl,
  folder = "general",
  onUploadComplete,
  label = "Gambar",
  bucket = "news-images",
  aspectRatio = "video",
  enableCrop = false,
}: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Crop state
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [selectedFileForCrop, setSelectedFileForCrop] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);

  const aspectClasses = {
    square: "aspect-square w-32",
    video: "aspect-video w-48",
    wide: "aspect-[21/9] w-64",
    news: "aspect-[3.3/1] w-[170px]",
  };

  const aspectRatioValues = {
    square: 1,
    video: 16 / 9,
    wide: 21 / 9,
    news: 3.3,
  };

  const getResizeDimensions = () => {
    if (aspectRatio === "news") {
      return { maxWidth: 340, maxHeight: Math.round(340 / 3.3) };
    }
    return { maxWidth: 1200, maxHeight: 800 };
  };

  const uploadBlob = async (blob: Blob, originalFileName: string) => {
    setIsUploading(true);
    
    try {
      const fileExt = originalFileName.split('.').pop() || 'jpg';
      const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, blob, {
          cacheControl: '3600',
          upsert: true,
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(data.path);

      const publicUrl = urlData.publicUrl;
      setPreviewUrl(publicUrl);
      onUploadComplete(publicUrl);
      toast.success("Gambar berhasil diupload");

    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Gagal mengupload gambar");
    } finally {
      setIsUploading(false);
      setOriginalFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const resizeImage = (file: File, maxWidth: number = 1200, maxHeight: number = 800, forceAspectRatio?: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      img.onload = () => {
        let { width, height } = img;
        
        if (forceAspectRatio) {
          const targetRatio = forceAspectRatio;
          const currentRatio = width / height;
          
          let cropWidth = width;
          let cropHeight = height;
          let cropX = 0;
          let cropY = 0;
          
          if (currentRatio > targetRatio) {
            cropWidth = height * targetRatio;
            cropX = (width - cropWidth) / 2;
          } else {
            cropHeight = width / targetRatio;
            cropY = (height - cropHeight) / 2;
          }
          
          width = maxWidth;
          height = Math.round(maxWidth / targetRatio);
          
          canvas.width = width;
          canvas.height = height;
          ctx?.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);
        } else {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }

          canvas.width = width;
          canvas.height = height;
          ctx?.drawImage(img, 0, 0, width, height);
        }

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to resize image'));
          },
          file.type,
          0.85
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Format file tidak didukung. Gunakan JPG, PNG, WebP, atau GIF.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Ukuran file maksimal 10MB");
      return;
    }

    // If crop is enabled, show crop dialog
    if (enableCrop) {
      const objectUrl = URL.createObjectURL(file);
      setSelectedFileForCrop(objectUrl);
      setOriginalFile(file);
      setCropDialogOpen(true);
      return;
    }

    // Standard upload without crop
    setIsUploading(true);

    try {
      const { maxWidth, maxHeight } = getResizeDimensions();
      const forceAspectRatio = aspectRatio === "news" ? 3.3 : undefined;
      
      let uploadFile: File | Blob = file;
      if (aspectRatio === "news" || file.size > 500 * 1024) {
        uploadFile = await resizeImage(file, maxWidth, maxHeight, forceAspectRatio);
      }

      await uploadBlob(uploadFile, file.name);
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Gagal mengupload gambar");
      setIsUploading(false);
    }
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    if (originalFile) {
      await uploadBlob(croppedBlob, originalFile.name);
    }
    
    // Cleanup
    if (selectedFileForCrop) {
      URL.revokeObjectURL(selectedFileForCrop);
    }
    setSelectedFileForCrop(null);
    setCropDialogOpen(false);
  };

  const handleCropClose = () => {
    if (selectedFileForCrop) {
      URL.revokeObjectURL(selectedFileForCrop);
    }
    setSelectedFileForCrop(null);
    setOriginalFile(null);
    setCropDialogOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (!previewUrl) return;

    try {
      const urlParts = previewUrl.split(`${bucket}/`);
      if (urlParts.length > 1) {
        const filePath = urlParts[1];
        await supabase.storage.from(bucket).remove([filePath]);
      }

      setPreviewUrl(null);
      onUploadComplete('');
      toast.success("Gambar berhasil dihapus");
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Gagal menghapus gambar");
    }
  };

  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      
      <div className="flex items-start gap-4">
        <div className={`relative ${aspectClasses[aspectRatio]} rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center overflow-hidden bg-muted/50`}>
          {previewUrl ? (
            <>
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full h-full object-cover"
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 h-6 w-6 rounded-full"
                onClick={handleRemove}
              >
                <X className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
          )}
        </div>

        <div className="flex-1 space-y-2">
          <Input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Mengupload...
              </>
            ) : (
              <>
                {enableCrop ? (
                  <Crop className="h-4 w-4 mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {previewUrl ? "Ganti Gambar" : enableCrop ? "Pilih & Crop" : "Upload Gambar"}
              </>
            )}
          </Button>
          
          <p className="text-xs text-muted-foreground">
            Format: JPG, PNG, WebP, GIF. Maksimal 10MB.
            {enableCrop && " Crop manual tersedia."}
          </p>
        </div>
      </div>

      {/* Crop Dialog */}
      {selectedFileForCrop && (
        <ImageCropper
          open={cropDialogOpen}
          onClose={handleCropClose}
          imageSrc={selectedFileForCrop}
          aspectRatio={aspectRatioValues[aspectRatio]}
          onCropComplete={handleCropComplete}
          outputWidth={aspectRatio === "news" ? 340 : 800}
        />
      )}
    </div>
  );
}
