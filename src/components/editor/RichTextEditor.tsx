import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  Link,
  Undo,
  Redo,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Code,
  Eye,
  Edit3,
  Table,
  Image,
  Strikethrough,
  Subscript,
  Superscript,
  Minus,
  Type,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  showSourceEditor?: boolean;
}

export function RichTextEditor({ 
  value, 
  onChange, 
  placeholder = "Tulis konten di sini...",
  showSourceEditor = true 
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [editorMode, setEditorMode] = useState<"visual" | "source">("visual");
  const [sourceCode, setSourceCode] = useState(value || "");

  // Initialize content only once
  useEffect(() => {
    if (editorRef.current && !isInitialized) {
      editorRef.current.innerHTML = value || "";
      setIsInitialized(true);
    }
  }, [value, isInitialized]);

  // Sync source code with value
  useEffect(() => {
    setSourceCode(value || "");
  }, [value]);

  // Update from external value changes
  useEffect(() => {
    if (editorRef.current && isInitialized && editorMode === "visual") {
      const currentContent = editorRef.current.innerHTML;
      if (value !== currentContent && value !== undefined) {
        const selection = window.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        editorRef.current.innerHTML = value;
        if (range && editorRef.current.contains(range.commonAncestorContainer)) {
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      }
    }
  }, [value, isInitialized, editorMode]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      onChange(html);
      setSourceCode(html);
    }
  }, [onChange]);

  const handleSourceChange = useCallback((newSource: string) => {
    setSourceCode(newSource);
    onChange(newSource);
    if (editorRef.current) {
      editorRef.current.innerHTML = newSource;
    }
  }, [onChange]);

  const handleModeChange = (mode: string) => {
    if (mode === "visual" && editorRef.current) {
      editorRef.current.innerHTML = sourceCode;
    }
    setEditorMode(mode as "visual" | "source");
  };

  const execCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  }, [handleInput]);

  const formatBlock = useCallback((tag: string) => {
    document.execCommand("formatBlock", false, tag);
    editorRef.current?.focus();
    handleInput();
  }, [handleInput]);

  const insertLink = useCallback(() => {
    const url = prompt("Masukkan URL:");
    if (url) {
      execCommand("createLink", url);
    }
  }, [execCommand]);

  const insertImage = useCallback(() => {
    const url = prompt("Masukkan URL gambar:");
    if (url) {
      execCommand("insertImage", url);
    }
  }, [execCommand]);

  const insertTable = useCallback(() => {
    const rows = prompt("Jumlah baris:", "3");
    const cols = prompt("Jumlah kolom:", "3");
    if (rows && cols) {
      let tableHtml = '<table border="1" style="border-collapse: collapse; width: 100%;">';
      for (let i = 0; i < parseInt(rows); i++) {
        tableHtml += '<tr>';
        for (let j = 0; j < parseInt(cols); j++) {
          tableHtml += i === 0 ? '<th style="padding: 8px; border: 1px solid #ccc;">Header</th>' : '<td style="padding: 8px; border: 1px solid #ccc;">Cell</td>';
        }
        tableHtml += '</tr>';
      }
      tableHtml += '</table><br>';
      document.execCommand("insertHTML", false, tableHtml);
      handleInput();
    }
  }, [handleInput]);

  const insertHorizontalRule = useCallback(() => {
    execCommand("insertHorizontalRule");
  }, [execCommand]);

  const ToolbarButton = ({ icon: Icon, onClick, title }: { icon: LucideIcon; onClick: () => void; title: string }) => (
    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClick} title={title}>
      <Icon className="h-4 w-4" />
    </Button>
  );

  return (
    <div className="border rounded-md overflow-hidden bg-background">
      {showSourceEditor ? (
        <Tabs value={editorMode} onValueChange={handleModeChange}>
          <div className="flex items-center justify-between border-b bg-muted/50 px-2">
            <TabsList className="h-9 bg-transparent">
              <TabsTrigger value="visual" className="gap-1.5 text-xs">
                <Edit3 className="h-3.5 w-3.5" />
                Visual
              </TabsTrigger>
              <TabsTrigger value="source" className="gap-1.5 text-xs">
                <Code className="h-3.5 w-3.5" />
                HTML Source
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="visual" className="mt-0">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-0.5 p-2 bg-muted/30 border-b">
              <ToolbarButton icon={Undo} onClick={() => execCommand("undo")} title="Undo" />
              <ToolbarButton icon={Redo} onClick={() => execCommand("redo")} title="Redo" />

              <Separator orientation="vertical" className="h-6 mx-1" />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-8 gap-1">
                    <Type className="h-4 w-4" />
                    <span className="text-xs">Heading</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => formatBlock("p")}>Paragraph</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => formatBlock("h1")}>Heading 1</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => formatBlock("h2")}>Heading 2</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => formatBlock("h3")}>Heading 3</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => formatBlock("h4")}>Heading 4</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => formatBlock("pre")}>Preformatted</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Separator orientation="vertical" className="h-6 mx-1" />

              <ToolbarButton icon={Bold} onClick={() => execCommand("bold")} title="Bold" />
              <ToolbarButton icon={Italic} onClick={() => execCommand("italic")} title="Italic" />
              <ToolbarButton icon={Underline} onClick={() => execCommand("underline")} title="Underline" />
              <ToolbarButton icon={Strikethrough} onClick={() => execCommand("strikeThrough")} title="Strikethrough" />
              <ToolbarButton icon={Subscript} onClick={() => execCommand("subscript")} title="Subscript" />
              <ToolbarButton icon={Superscript} onClick={() => execCommand("superscript")} title="Superscript" />

              <Separator orientation="vertical" className="h-6 mx-1" />

              <ToolbarButton icon={AlignLeft} onClick={() => execCommand("justifyLeft")} title="Align Left" />
              <ToolbarButton icon={AlignCenter} onClick={() => execCommand("justifyCenter")} title="Align Center" />
              <ToolbarButton icon={AlignRight} onClick={() => execCommand("justifyRight")} title="Align Right" />

              <Separator orientation="vertical" className="h-6 mx-1" />

              <ToolbarButton icon={List} onClick={() => execCommand("insertUnorderedList")} title="Bullet List" />
              <ToolbarButton icon={ListOrdered} onClick={() => execCommand("insertOrderedList")} title="Numbered List" />
              <ToolbarButton icon={Quote} onClick={() => formatBlock("blockquote")} title="Quote" />

              <Separator orientation="vertical" className="h-6 mx-1" />

              <ToolbarButton icon={Link} onClick={insertLink} title="Insert Link" />
              <ToolbarButton icon={Image} onClick={insertImage} title="Insert Image" />
              <ToolbarButton icon={Table} onClick={insertTable} title="Insert Table" />
              <ToolbarButton icon={Minus} onClick={insertHorizontalRule} title="Horizontal Line" />
            </div>

            {/* Visual Editor */}
            <div
              ref={editorRef}
              contentEditable
              className="min-h-[300px] max-h-[500px] overflow-y-auto p-4 focus:outline-none prose prose-sm dark:prose-invert max-w-none"
              onInput={handleInput}
              data-placeholder={placeholder}
              style={{ wordBreak: "break-word" }}
            />
          </TabsContent>

          <TabsContent value="source" className="mt-0">
            <div className="p-2 bg-muted/30 border-b">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Code className="h-3 w-3" />
                Edit HTML source code langsung
              </p>
            </div>
            <Textarea
              value={sourceCode}
              onChange={(e) => handleSourceChange(e.target.value)}
              className="min-h-[350px] font-mono text-sm border-0 rounded-none resize-none focus-visible:ring-0"
              placeholder="<p>Tulis HTML di sini...</p>"
            />
          </TabsContent>
        </Tabs>
      ) : (
        <>
          {/* Simple Toolbar without tabs */}
          <div className="flex flex-wrap items-center gap-0.5 p-2 bg-muted/50 border-b">
            <ToolbarButton icon={Undo} onClick={() => execCommand("undo")} title="Undo" />
            <ToolbarButton icon={Redo} onClick={() => execCommand("redo")} title="Redo" />
            <Separator orientation="vertical" className="h-6 mx-1" />
            <ToolbarButton icon={Heading1} onClick={() => formatBlock("h1")} title="Heading 1" />
            <ToolbarButton icon={Heading2} onClick={() => formatBlock("h2")} title="Heading 2" />
            <ToolbarButton icon={Heading3} onClick={() => formatBlock("h3")} title="Heading 3" />
            <Separator orientation="vertical" className="h-6 mx-1" />
            <ToolbarButton icon={Bold} onClick={() => execCommand("bold")} title="Bold" />
            <ToolbarButton icon={Italic} onClick={() => execCommand("italic")} title="Italic" />
            <ToolbarButton icon={Underline} onClick={() => execCommand("underline")} title="Underline" />
            <Separator orientation="vertical" className="h-6 mx-1" />
            <ToolbarButton icon={AlignLeft} onClick={() => execCommand("justifyLeft")} title="Align Left" />
            <ToolbarButton icon={AlignCenter} onClick={() => execCommand("justifyCenter")} title="Align Center" />
            <ToolbarButton icon={AlignRight} onClick={() => execCommand("justifyRight")} title="Align Right" />
            <Separator orientation="vertical" className="h-6 mx-1" />
            <ToolbarButton icon={List} onClick={() => execCommand("insertUnorderedList")} title="Bullet List" />
            <ToolbarButton icon={ListOrdered} onClick={() => execCommand("insertOrderedList")} title="Numbered List" />
            <Separator orientation="vertical" className="h-6 mx-1" />
            <ToolbarButton icon={Quote} onClick={() => formatBlock("blockquote")} title="Quote" />
            <ToolbarButton icon={Link} onClick={insertLink} title="Insert Link" />
          </div>

          {/* Editor */}
          <div
            ref={editorRef}
            contentEditable
            className="min-h-[300px] max-h-[500px] overflow-y-auto p-4 focus:outline-none prose prose-sm dark:prose-invert max-w-none"
            onInput={handleInput}
            data-placeholder={placeholder}
            style={{ wordBreak: "break-word" }}
          />
        </>
      )}

      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground));
          pointer-events: none;
        }
        [contenteditable] h1 {
          font-size: 1.875rem;
          font-weight: 700;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }
        [contenteditable] h2 {
          font-size: 1.5rem;
          font-weight: 600;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }
        [contenteditable] h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 0.75rem;
          margin-bottom: 0.5rem;
        }
        [contenteditable] h4 {
          font-size: 1.125rem;
          font-weight: 600;
          margin-top: 0.75rem;
          margin-bottom: 0.5rem;
        }
        [contenteditable] blockquote {
          border-left: 4px solid hsl(var(--primary));
          padding-left: 1rem;
          font-style: italic;
          margin: 1rem 0;
        }
        [contenteditable] ul, [contenteditable] ol {
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        [contenteditable] a {
          color: hsl(var(--primary));
          text-decoration: underline;
        }
        [contenteditable] table {
          border-collapse: collapse;
          width: 100%;
          margin: 1rem 0;
        }
        [contenteditable] th, [contenteditable] td {
          border: 1px solid hsl(var(--border));
          padding: 0.5rem;
        }
        [contenteditable] th {
          background: hsl(var(--muted));
          font-weight: 600;
        }
        [contenteditable] img {
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
        }
        [contenteditable] pre {
          background: hsl(var(--muted));
          padding: 1rem;
          border-radius: 0.5rem;
          overflow-x: auto;
          font-family: monospace;
        }
        [contenteditable] hr {
          border: none;
          border-top: 1px solid hsl(var(--border));
          margin: 1.5rem 0;
        }
      `}</style>
    </div>
  );
}
