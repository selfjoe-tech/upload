"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, X as XIcon, Search } from "lucide-react";
import type { ImagePreviewPayload } from "./ImagePreviewer";

const ACCENT = "pink";
const AUDIENCES = ["Straight","Trans","Gay","Bisexual","Lesbian","Animated"];
const SUGGESTED = [
  "Amateur","Ass","Big Tits","OnlyFans","Tits","Teen","Cumshot","Pussy","Big Dick",
  "MILF","Solo","Blowjob","NSFW","Anal","POV","Ebony","Asian","Latina","Redhead",
  "Public","BBW","DoggyStyle","Hotwife","Interracial","Gay","Femboy","Tiktok",
];

type Props = {
  images: ImagePreviewPayload;
  onCancel: () => void; // back to previewer
  onSubmit: (payload: {
    audience: string; tags: string[]; description: string; images: ImagePreviewPayload;
  }) => void;
};

function Stepper({ step, total = 3 }: { step: number; total?: number }) {
  const pct = (step - 1) / (total - 1);
  return (
    <div className="w-full">
      <div className="h-0.5 bg-white/15 rounded-full relative">
        <div className="h-0.5 rounded-full" style={{ width: `${pct * 100}%`, backgroundColor: ACCENT }} />
        <div className="absolute -top-[5px] h-3 w-3 rounded-full" style={{ left: `calc(${pct * 100}% - 6px)`, backgroundColor: ACCENT }} />
      </div>
    </div>
  );
}

export default function UploadFlowImages({ images, onCancel, onSubmit }: Props) {
  const [step, setStep] = React.useState<1|2|3>(1);
  const [audience, setAudience] = React.useState("Straight");
  const [tags, setTags] = React.useState<string[]>([]);
  const [query, setQuery] = React.useState("");
  const [description, setDescription] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return SUGGESTED.filter(t => t.toLowerCase().includes(q)).slice(0, 30);
  }, [query]);

  const addTag = (t: string) => {
    const v = t.trim();
    if (!v) return;
    const cap = v[0].toUpperCase() + v.slice(1);
    if (tags.includes(cap) || tags.length >= 10) return;
    setTags(p => [...p, cap]);
    setQuery("");
  };
  const removeTag = (t: string) => setTags(p => p.filter(x => x !== t));
  const canNextFromTags = tags.length >= 3 && tags.length <= 10;

  return (
    <div className="mx-auto max-w-[880px] px-4 py-6 space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Upload Content</h1>
        <Stepper step={step} />
      </div>

      <div className="rounded-2xl bg-[#121212] border border-white/10">
        <div className="flex items-center gap-2 p-4 border-b border-white/10">
          <button
            onClick={() => (step === 1 ? onCancel() : setStep((s) => (s > 1 ? ((s-1) as 1|2|3) : s)))}
            className="rounded-full p-2 hover:bg-white/10"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <p className="font-semibold text-lg">
            {step === 1 && "Choose main audience"}
            {step === 2 && "Add Tags"}
            {step === 3 && "Description"}
          </p>
        </div>

        <div className="p-5 sm:p-6">
          {step === 1 && (
            <div className="space-y-6">
              <p className="text-sm text-white/80">Choose the main audience for this content:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-16 gap-y-5">
                {AUDIENCES.map((a) => {
                  const active = a === audience;
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAudience(a)}
                      className={`flex items-center justify-between rounded-full border px-4 py-2
                        ${active ? "border-white bg-white text-black" : "border-white/25 hover:bg-white/10"}`}
                    >
                      <span className={`text-base ${active ? "font-semibold" : ""}`}>{a}</span>
                      <span className={`h-4 w-4 rounded-full border ${active ? "border-black bg-black/80" : "border-white/40"}`} />
                    </button>
                  );
                })}
              </div>
              <div className="pt-2">
                <Button
                  onClick={() => setStep(2)}
                  className="w-full sm:w-56 h-11 rounded-full text-black font-semibold"
                  style={{ backgroundColor: ACCENT }}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <p className="text-sm text-white/80">Select <span className="font-semibold">3 – 10</span> tags to describe your upload.</p>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-60">
                    <Search className="h-4 w-4" />
                  </span>
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Type to search for tags…"
                    className="pl-9 bg-black/40 border-white/20"
                  />
                </div>
                <Button
                  onClick={() => addTag(query)}
                  variant="secondary"
                  className="rounded-full"
                  disabled={!query.trim() || tags.length >= 10}
                >
                  Add tag
                </Button>
              </div>

              {tags.length > 0 && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((t) => (
                      <Badge key={t} className="rounded-full bg-transparent border border-[--badge] text-white"
                        style={{ ["--badge" as any]: ACCENT }}>
                        <span className="mr-1.5">{t}</span>
                        <button className="ml-1 -mr-1.5 rounded-full p-0.5 hover:bg-white/10" onClick={() => removeTag(t)}>
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <Separator className="bg-white/10" />
                </>
              )}

              <div className="flex flex-wrap gap-2">
                {filtered.map((t) => {
                  const active = tags.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => (active ? removeTag(t) : addTag(t))}
                      className={`px-3 py-1.5 rounded-full border text-sm
                        ${active ? "bg-[--accent] text-black border-transparent" :
                                   "border-[--accent] text-white/90 hover:bg-[--accent]/10"}`}
                      style={{ ["--accent" as any]: ACCENT }}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={() => setStep(1)} className="rounded-full">Back</Button>
                <Button
                  onClick={() => setStep(3)}
                  className="rounded-full text-black font-semibold"
                  style={{ backgroundColor: ACCENT }}
                  disabled={!canNextFromTags}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <p className="text-sm text-white/80">
                <span className="font-semibold">Content with engaging descriptions get 2.5× more likes</span>{" "}
                than content without.
              </p>
              <p className="text-xs text-white/60 -mt-3">Describe what’s happening to boost engagement.</p>

              <Textarea
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Write a short description…"
                className="bg-black/40 border-white/20"
              />

              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={() => setStep(2)} className="rounded-full">Back</Button>
                <Button
                  onClick={() => onSubmit({ audience, tags, description, images })}
                  className="w-full sm:w-56 h-11 rounded-full text-black font-semibold"
                  style={{ backgroundColor: ACCENT }}
                >
                  Submit
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
