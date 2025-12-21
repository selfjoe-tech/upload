"use client";

import * as React from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Star, Trash2, ArrowUp, ArrowDown } from "lucide-react";

const ACCENT = "pink";

export type ImagePreviewPayload = {
  files: File[];      // ordered files (returned)
  order: number[];    // original indices in display order
  coverIndex: number; // index inside ordered array
};

type Props = {
  files: File[]; // MULTI
  onBack: () => void;
  onNext: (payload: ImagePreviewPayload) => void;
};

export default function ImagePreviewer({ files, onBack, onNext }: Props) {
  const [urls, setUrls] = React.useState<(string | undefined)[]>([]);
  const [order, setOrder] = React.useState<number[]>(() => files.map((_, i) => i));
  const [cover, setCover] = React.useState(0);

  React.useEffect(() => {
    const u = files.map((f) => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach((x) => { try { URL.revokeObjectURL(x); } catch {} });
  }, [files]);

  const ready = urls.length === files.length && urls.every(Boolean);
  const orderedFiles = order.map((i) => files[i]);
  const getUrlAtPos = (pos: number) => urls[order[pos]];

  const move = (pos: number, dir: -1 | 1) => {
    const next = [...order];
    const np = pos + dir;
    if (np < 0 || np >= next.length) return;
    [next[pos], next[np]] = [next[np], next[pos]];
    setOrder(next);
    if (cover === pos) setCover(np);
    else if (cover === np) setCover(pos);
  };

  const remove = (pos: number) => {
    if (order.length <= 1) return;
    const next = order.filter((_, i) => i !== pos);
    setOrder(next);
    if (cover === pos) setCover(Math.max(0, pos - 1));
    else if (cover > pos) setCover((c) => c - 1);
  };

  return (
    <div className="pb-6">
      <header className="sticky top-0 z-10 flex items-center justify-center h-14 bg-black/80 backdrop-blur border-b border-white/10">
        <button onClick={onBack} aria-label="Back" className="absolute left-3 rounded-full p-2 hover:bg-white/10">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-semibold">Image Preview</h2>
      </header>

      <div className="mx-auto max-w-[1100px] px-4 pt-4 space-y-5">
        <Card className="bg-[#101010] border-white/10 p-4">
          {/* Cover */}
          {(() => {
            const u = ready ? getUrlAtPos(cover) : undefined;
            return u ? (
              <div className="mb-4">
                <div className="text-sm text-white/70 mb-2">Cover</div>
                <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black">
                  <Image
                    src={u}
                    alt="Upskirt Candy Cover"
                    fill
                    unoptimized
                    sizes="100vw"
                    className="object-contain"
                  />
                </div>
              </div>
            ) : (
              <div className="mb-4">
                <div className="text-sm text-white/70 mb-2">Cover</div>
                <div className="w-full aspect-video rounded-lg bg-white/10 animate-pulse" />
              </div>
            );
          })()}

          {/* Grid */}
          <div className="grid grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
            {order.map((_, pos) => {
              const u = getUrlAtPos(pos);
              return (
                <div key={`${order[pos]}-${pos}`} className="relative group rounded-lg overflow-hidden border border-white/10 bg-black">
                  <div className="relative w-full aspect-square">
                    {u ? (
                      <Image
                        src={u}
                        alt={`image-${pos} on Upskirt Candy`}
                        fill
                        unoptimized
                        sizes="(max-width:768px) 33vw, (max-width:1280px) 25vw, 16vw"
                        className="object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-white/10 animate-pulse" />
                    )}
                  </div>

                  <div className="absolute inset-x-0 bottom-0 p-1.5 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent">
                    <div className="flex gap-1">
                      <button className="rounded p-1 bg-white/10 hover:bg-white/20" onClick={() => move(pos, -1)} aria-label="Move up">
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button className="rounded p-1 bg-white/10 hover:bg-white/20" onClick={() => move(pos, +1)} aria-label="Move down">
                        <ArrowDown className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex gap-1">
                      <button
                        className={`rounded p-1 ${cover === pos ? "bg-[--acc]" : "bg-white/10 hover:bg-white/20"}`}
                        onClick={() => setCover(pos)}
                        aria-label="Set cover"
                        style={{ ["--acc" as any]: ACCENT }}
                      >
                        <Star className={`h-4 w-4 ${cover === pos ? "text-black fill-black" : ""}`} />
                      </button>
                      <button className="rounded p-1 bg-white/10 hover:bg-white/20" onClick={() => remove(pos)} aria-label="Remove">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Next */}
          <div className="flex justify-end mt-4">
            <Button
              onClick={() => onNext({ files: orderedFiles, order, coverIndex: cover })}
              className="rounded-full text-black font-semibold"
              style={{ backgroundColor: ACCENT }}
              disabled={!ready}
            >
              Next
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
